from __future__ import annotations

from typing import Any, Dict, Optional, Tuple, List
import re
import time

from .base import Ctx, CapResult, Capability, add_utils_to_syspath, save_json, timestamp

# Ensure we can import local utils under API-test-space/utils
add_utils_to_syspath()
try:
    from selenium_ui_controls import HighPriorityControls, ZoomManager
    from selenium.webdriver.common.by import By
except Exception:
    HighPriorityControls = None  # type: ignore
    ZoomManager = None  # type: ignore
    By = None  # type: ignore


class ProfileScan(Capability):
    """
    Capability: Read profile/account information from the user avatar dropdown, plus
    account, balance and amount (read-only).

    Interface: run(ctx, {})
    Outputs (top-level):
      - account: "DEMO" | "REAL" | "UNKNOWN"
      - balance: float | None
      - amount: float | None
      - display_name: str | None
      - user_id: str | None
      - email: str | None
      - currency: str | None             # e.g., USD/EUR/GBP (best-effort)
      - level_label: str | None          # e.g., Beginner
      - xp_current: int | None
      - xp_total: int | None
      - account_banner: str | None       # e.g., "YOU ARE TRADING ON DEMO ACCOUNT"
      - today_stats: {trades, turnover, profit} (values may be None)
      - nav_items: List[str]             # menu entries on the right side of the panel
      - raw: diagnostics/meta (viewport_scale is kept under raw for context)

    Kind: "read"
    """
    id = "profile_scan"
    kind = "read"

    def run(self, ctx: Ctx, inputs: Dict[str, Any]) -> CapResult:
        data: Dict[str, Any] = {
            "account": "UNKNOWN",
            "balance": None,
            "amount": None,
            "display_name": None,
            "user_id": None,
            "email": None,
            "currency": None,
            "level_label": None,
            "xp_current": None,
            "xp_total": None,
            "account_banner": None,
            "today_stats": {"trades": None, "turnover": None, "profit": None},
            "nav_items": [],
            "raw": {},
        }
        artifacts: List[str] = []

        if HighPriorityControls is None or By is None:
            return CapResult(ok=False, data=data, error="Selenium helpers not available", artifacts=tuple(artifacts))

        hpc = HighPriorityControls(ctx.driver)

        # Account type + balance
        bal_text = ""
        try:
            meta = hpc.read_balance_and_account_type_with_meta()
            data["raw"]["balance_and_account_meta"] = meta
            acct = meta.get("account_type")
            if acct in ("DEMO", "REAL"):
                data["account"] = acct
            bal_text = (meta.get("balance_text") or "").strip()
            data["balance"] = self._parse_money(bal_text)
            # Best-effort currency detection from balance text or header meta
            data["currency"] = self._detect_currency(meta, bal_text)
        except Exception as e:
            data["raw"]["balance_error"] = str(e)

        # Amount field (read-only)
        try:
            amount_val, amount_meta = self._read_amount_value(ctx)
            data["amount"] = amount_val
            data["raw"]["amount_meta"] = amount_meta
        except Exception as e:
            data["raw"]["amount_error"] = str(e)

        # Optional viewport scale for context (read-only) - store only under raw
        try:
            if ZoomManager is not None:
                ok_zoom, observed = ZoomManager.verify(ctx.driver, expected=0.67, tolerance=0.05)
                data["raw"]["viewport_scale"] = observed
                data["raw"]["viewport_scale_ok"] = ok_zoom
        except Exception:
            pass

        # Open profile panel (avatar dropdown) and extract profile-specific info
        try:
            opened, container, open_meta = self._open_profile_panel(ctx)
            data["raw"]["profile_panel_open"] = {"opened": opened, **open_meta}
            if opened and container is not None:
                # Consolidated text snapshot for regex-based parsing
                full_text = (container.text or "").strip()

                # Display name
                name_val, name_meta = self._extract_display_name(container)
                data["display_name"] = name_val
                data["raw"]["display_name_meta"] = name_meta

                # User id + email (email explicitly requested)
                uid_val, email_val, id_email_meta = self._extract_user_id_email(container, full_text)
                data["user_id"] = uid_val
                data["email"] = email_val
                data["raw"]["id_email_meta"] = id_email_meta

                # Currency refinement from panel if present
                cur_val, cur_meta = self._extract_currency(container, full_text, fallback=data["currency"])
                data["currency"] = cur_val
                data["raw"]["currency_meta"] = cur_meta

                # Level + XP
                level_val, xp_cur, xp_tot, level_meta = self._extract_level_xp(container, full_text)
                data["level_label"] = level_val
                data["xp_current"] = xp_cur
                data["xp_total"] = xp_tot
                data["raw"]["level_xp_meta"] = level_meta

                # Account banner inside panel (e.g., DEMO banner)
                banner_val, banner_meta = self._extract_account_banner(container, full_text)
                data["account_banner"] = banner_val
                data["raw"]["account_banner_meta"] = banner_meta

                # Today stats block
                stats_val, stats_meta = self._extract_today_stats(container, full_text)
                data["today_stats"] = stats_val
                data["raw"]["today_stats_meta"] = stats_meta

                # Right-side navigation items shown in the panel
                nav_items, nav_meta = self._extract_nav_items(container)
                data["nav_items"] = nav_items
                data["raw"]["nav_items_meta"] = nav_meta
        except Exception as e:
            data["raw"]["profile_panel_error"] = str(e)

        # -------- fallbacks using full page when panel parsing yields gaps --------
        try:
            body_text = self._get_body_text(ctx) or ""
            # display_name fallback via broad JS query across document
            if not data.get("display_name"):
                dn, dn_meta = self._fallback_display_name(ctx)
                if dn:
                    data["display_name"] = dn
                    data["raw"]["display_name_fallback_meta"] = dn_meta

            # id/email fallback via page text regex (captures cases in shadow DOM)
            if not data.get("email") or not data.get("user_id"):
                uid2, email2, id_email_meta2 = self._fallback_user_id_email(body_text)
                if data.get("user_id") is None and uid2:
                    data["user_id"] = uid2
                if data.get("email") is None and email2:
                    data["email"] = email2
                data["raw"]["id_email_fallback_meta"] = id_email_meta2

            # level/xp fallback via body text
            if not data.get("level_label") or data.get("xp_current") is None or data.get("xp_total") is None:
                lvl2, xp_cur2, xp_tot2, lvl_meta2 = self._extract_level_xp(None, body_text)
                if lvl2:
                    data["level_label"] = lvl2
                if xp_cur2 is not None:
                    data["xp_current"] = xp_cur2
                if xp_tot2 is not None:
                    data["xp_total"] = xp_tot2
                data["raw"]["level_xp_fallback_meta"] = lvl_meta2

            # banner fallback
            if not data.get("account_banner"):
                banner2, banner_meta2 = self._extract_account_banner(None, body_text)
                if banner2:
                    data["account_banner"] = banner2
                data["raw"]["account_banner_fallback_meta"] = banner_meta2

            # today stats fallback
            ts = data.get("today_stats") or {}
            if not any(v is not None for v in ts.values()):
                stats2, stats_meta2 = self._extract_today_stats(None, body_text)
                data["today_stats"] = stats2
                data["raw"]["today_stats_fallback_meta"] = stats_meta2

            # nav items fallback via broad JS query
            if not data.get("nav_items"):
                nav2, nav_meta2 = self._fallback_nav_items(ctx)
                data["nav_items"] = nav2
                data["raw"]["nav_items_fallback_meta"] = nav_meta2

            # balance fallback from full page text (handles 'USD\n48,282.49' etc.)
            if data.get("balance") is None:
                bal2, bal_meta2 = self._extract_balance_from_text(body_text)
                if bal2 is not None:
                    data["balance"] = bal2
                data["raw"]["balance_fallback_meta"] = bal_meta2

            # display_name from context around email
            if not data.get("display_name"):
                dn2, dn2_meta = self._infer_name_from_email_context(body_text, data.get("email"))
                if dn2:
                    data["display_name"] = dn2
                data["raw"]["display_name_email_ctx_meta"] = dn2_meta
        except Exception as e:
            data["raw"]["fallback_error"] = str(e)

        # Debug artifacts
        if ctx.debug:
            try:
                ts = timestamp()
                path = save_json(ctx, f"profile_scan_{ts}.json", data, subfolder="profile_scan")
                artifacts.append(path)
            except Exception:
                pass

        return CapResult(ok=True, data=data, error=None, artifacts=tuple(artifacts))

    # ---------- helpers ----------

    def _parse_money(self, text: str) -> Optional[float]:
        # Strip currency symbols and separators
        try:
            t = text.replace(",", "").replace(" ", "")
            for sym in ["$", "€", "£"]:
                t = t.replace(sym, "")
            # Some locales: replace thousand separators/dot
            if t.count(".") > 1 and "," in t:
                t = t.replace(".", "").replace(",", ".")
            return float(t)
        except Exception:
            # Try comma as decimal
            try:
                t = text.replace(" ", "").replace(".", "").replace(",", ".")
                for sym in ["$", "€", "£"]:
                    t = t.replace(sym, "")
                return float(t)
            except Exception:
                return None

    def _read_amount_value(self, ctx: Ctx) -> Tuple[Optional[float], Dict[str, Any]]:
        """
        Best-effort read of Amount input value without modifying it.
        """
        meta: Dict[str, Any] = {"strategies": [], "raw_value": None, "parsed": None}
        strategies = [
            ("xpath", "//*[contains(normalize-space(.), 'Amount')]/following::input[1]"),
            ("xpath", "//input[contains(@placeholder,'Amount') or contains(@aria-label,'Amount')]"),
            ("css", "input.amount, .amount input, input[name*='amount']"),
        ]
        el = None
        for strat, sel in strategies:
            try:
                if strat == "xpath":
                    els = ctx.driver.find_elements(By.XPATH, sel)
                else:
                    els = ctx.driver.find_elements(By.CSS_SELECTOR, sel)
            except Exception:
                els = []
            cand = next((e for e in els if self._is_displayed(e)), None)
            meta["strategies"].append({"strategy": strat, "selector": sel, "found": bool(cand)})
            if cand:
                el = cand
                break

        if not el:
            return None, meta

        try:
            val = (el.get_attribute("value") or "").strip()
            meta["raw_value"] = val
            # normalize
            norm = val.replace(" ", "").replace(",", "")
            parsed = None
            try:
                parsed = float(norm)
            except Exception:
                try:
                    parsed = float(val.replace(" ", "").replace(",", "."))
                except Exception:
                    parsed = None
            meta["parsed"] = parsed
            return parsed, meta
        except Exception as e:
            meta["error"] = str(e)
            return None, meta

    def _is_displayed(self, el) -> bool:
        try:
            return el.is_displayed()
        except Exception:
            return False

    # ----- Profile panel open/locate -----

    def _open_profile_panel(self, ctx: Ctx) -> Tuple[bool, Optional[object], Dict[str, Any]]:
        meta: Dict[str, Any] = {"avatar_attempts": [], "container_attempts": []}
        driver = ctx.driver

        avatar_selectors = [
            ("css", "img[alt*='profile' i]"),
            ("css", "img[alt*='avatar' i]"),
            ("css", "[class*='avatar' i] img"),
            ("css", "[class*='avatar' i]"),
            ("css", "[class*='user' i] img"),
            ("xpath", "//header//*[self::img or self::button][contains(translate(@class,'AVATAR','avatar'),'avatar') or contains(translate(@alt,'AVATAR','avatar'),'avatar') or contains(translate(@alt,'PROFILE','profile'),'profile')]"),
        ]

        avatar_el = None
        for strat, sel in avatar_selectors:
            try:
                if strat == "css":
                    els = driver.find_elements(By.CSS_SELECTOR, sel)
                else:
                    els = driver.find_elements(By.XPATH, sel)
            except Exception:
                els = []
            cand = next((e for e in els if self._is_displayed(e)), None)
            meta["avatar_attempts"].append({"strategy": strat, "selector": sel, "found": bool(cand)})
            if cand:
                avatar_el = cand
                break

        if avatar_el:
            try:
                avatar_el.click()
                time.sleep(0.4)
            except Exception as e:
                meta["avatar_click_error"] = str(e)

        # Locate panel container
        container_selectors = [
            ("css", "aside[class*='profile' i]"),
            ("css", "div[class*='profile' i][class*='menu' i]"),
            ("css", "div[class*='profile' i]"),
            ("xpath", "//*[contains(@class,'profile') and (contains(@class,'menu') or contains(@class,'panel') or contains(@class,'dropdown'))]"),
            ("xpath", "//*[contains(normalize-space(),'Logout')]/ancestor::*[self::aside or self::div][1]"),
        ]
        container = None
        for strat, sel in container_selectors:
            try:
                if strat == "css":
                    els = driver.find_elements(By.CSS_SELECTOR, sel)
                else:
                    els = driver.find_elements(By.XPATH, sel)
            except Exception:
                els = []
            cand = next((e for e in els if self._is_displayed(e)), None)
            meta["container_attempts"].append({"strategy": strat, "selector": sel, "found": bool(cand)})
            if cand:
                container = cand
                break

        return (container is not None), container, meta

    # ----- Field extractors -----

    def _extract_display_name(self, container) -> Tuple[Optional[str], Dict[str, Any]]:
        meta: Dict[str, Any] = {"strategies": []}
        candidates: List[str] = []
        try:
            # Try common header tags first
            for tag in ("h1", "h2", "h3"):
                els = container.find_elements(By.CSS_SELECTOR, tag)
                for el in els:
                    if not self._is_displayed(el):
                        continue
                    txt = (el.text or "").strip()
                    if len(txt) >= 2:
                        candidates.append(txt)
                        meta["strategies"].append({"tag": tag, "text": txt})
            # Fallback: prominent strong/bold near top
            if not candidates:
                els = container.find_elements(By.CSS_SELECTOR, "strong, .name, .user-name, .profile-name")
                for el in els:
                    if not self._is_displayed(el):
                        continue
                    txt = (el.text or "").strip()
                    if len(txt) >= 2:
                        candidates.append(txt)
                        meta["strategies"].append({"tag": "strong/name", "text": txt})
        except Exception as e:
            meta["error"] = str(e)

        return (candidates[0] if candidates else None), meta

    def _extract_user_id_email(self, container, full_text: str) -> Tuple[Optional[str], Optional[str], Dict[str, Any]]:
        meta: Dict[str, Any] = {"regex": {}, "attempts": []}
        # Email
        email = None
        try:
            # Direct anchor
            anchors = []
            try:
                anchors = container.find_elements(By.XPATH, ".//a[starts-with(@href,'mailto:')]")
            except Exception:
                anchors = []
            for a in anchors:
                if not self._is_displayed(a):
                    continue
                t = (a.text or "").strip()
                if "@" in t:
                    email = t
                    break
            if email is None:
                # Regex search in consolidated text
                m = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", full_text)
                if m:
                    email = m.group(0)
            meta["regex"]["email_matched"] = bool(email)
        except Exception as e:
            meta["email_error"] = str(e)

        # User ID (usually 'id 101002476' style)
        user_id = None
        try:
            m = re.search(r"\b(?:id|ID)\s*([0-9]{5,})", full_text)
            if m:
                user_id = m.group(1)
            else:
                # fallback: long digit sequence near email line
                m2 = re.search(r"\b([0-9]{7,})\b", full_text)
                if m2:
                    user_id = m2.group(1)
            meta["regex"]["id_matched"] = bool(user_id)
        except Exception as e:
            meta["id_error"] = str(e)

        return user_id, email, meta

    def _detect_currency(self, balance_meta: Dict[str, Any], bal_text: str) -> Optional[str]:
        # Try to infer currency from symbol or known codes near balance
        text = f"{bal_text} {balance_meta}".upper()
        if "USD" in text:
            return "USD"
        if "EUR" in text:
            return "EUR"
        if "GBP" in text:
            return "GBP"
        # Symbols
        if "$" in bal_text:
            return "USD"
        if "€" in bal_text:
            return "EUR"
        if "£" in bal_text:
            return "GBP"
        return None

    def _extract_currency(self, container, full_text: str, fallback: Optional[str]) -> Tuple[Optional[str], Dict[str, Any]]:
        meta: Dict[str, Any] = {"fallback": fallback}
        try:
            txt = full_text.upper()
            for code in ("USD", "EUR", "GBP"):
                if code in txt:
                    meta["matched"] = code
                    return code, meta
        except Exception as e:
            meta["error"] = str(e)
        return fallback, meta

    def _extract_level_xp(self, container, full_text: str) -> Tuple[Optional[str], Optional[int], Optional[int], Dict[str, Any]]:
        meta: Dict[str, Any] = {}
        level_label = None
        xp_current = None
        xp_total = None
        try:
            # Level label heuristics (look for known badges)
            m_level = re.search(r"\b(Beginner|Intermediate|Experienced|Advanced|Pro|Expert)\b", full_text, re.IGNORECASE)
            if m_level:
                level_label = m_level.group(1)

            # XP: e.g. "30 / 200 XP"
            m_xp = re.search(r"(\d+)\s*/\s*(\d+)\s*XP", full_text, re.IGNORECASE)
            if m_xp:
                xp_current = int(m_xp.group(1))
                xp_total = int(m_xp.group(2))

            meta["level_found"] = level_label is not None
            meta["xp_found"] = xp_current is not None and xp_total is not None
        except Exception as e:
            meta["error"] = str(e)
        return level_label, xp_current, xp_total, meta

    def _extract_account_banner(self, container, full_text: str) -> Tuple[Optional[str], Dict[str, Any]]:
        meta: Dict[str, Any] = {}
        banner = None
        try:
            for phrase in [
                "YOU ARE TRADING ON DEMO ACCOUNT",
                "YOU ARE TRADING ON REAL ACCOUNT",
                "DEMO ACCOUNT",
                "REAL ACCOUNT",
            ]:
                if phrase in full_text.upper():
                    banner = phrase
                    break
            meta["banner_found"] = banner is not None
        except Exception as e:
            meta["error"] = str(e)
        return banner, meta

    def _extract_today_stats(self, container, full_text: str) -> Tuple[Dict[str, Optional[float]], Dict[str, Any]]:
        meta: Dict[str, Any] = {}
        stats: Dict[str, Optional[float]] = {"trades": None, "turnover": None, "profit": None}
        try:
            # Trades: number
            m_trades = re.search(r"Trades:\s*(\d+)", full_text, re.IGNORECASE)
            if m_trades:
                stats["trades"] = float(m_trades.group(1))

            # Turnover / Profit: may include currency symbols
            m_turnover = re.search(r"Trading\s+turnover:\s*([^\n\r]+)", full_text, re.IGNORECASE)
            if m_turnover:
                stats["turnover"] = self._parse_money(m_turnover.group(1).strip())
            m_profit = re.search(r"Trading\s+profit:\s*([^\n\r]+)", full_text, re.IGNORECASE)
            if m_profit:
                stats["profit"] = self._parse_money(m_profit.group(1).strip())

            meta["found"] = any(v is not None for v in stats.values())
        except Exception as e:
            meta["error"] = str(e)
        return stats, meta

    def _extract_nav_items(self, container) -> Tuple[List[str], Dict[str, Any]]:
        meta: Dict[str, Any] = {"count": 0}
        items: List[str] = []
        try:
            els = []
            try:
                els = container.find_elements(By.CSS_SELECTOR, "a, button, [role='menuitem']")
            except Exception:
                els = []
            for el in els:
                if not self._is_displayed(el):
                    continue
                txt = (el.text or "").strip()
                # Filter out empty or icon-only buttons
                if len(txt) >= 2:
                    items.append(txt)
            # Deduplicate while preserving order
            seen = set()
            deduped: List[str] = []
            for t in items:
                if t in seen:
                    continue
                seen.add(t)
                deduped.append(t)
            items = deduped
            meta["count"] = len(items)
        except Exception as e:
            meta["error"] = str(e)
        return items, meta


# Factory
    # ----- Global/body fallbacks -----

    def _get_body_text(self, ctx: Ctx) -> str:
        try:
            return ctx.driver.execute_script("return (document.body && (document.body.innerText || document.body.textContent)) || '';")
        except Exception:
            return ""

    def _fallback_display_name(self, ctx: Ctx) -> Tuple[Optional[str], Dict[str, Any]]:
        meta: Dict[str, Any] = {"selectors": [], "candidates": []}
        # Broad set of candidate selectors searched at document scope
        selectors = [
            "div[class*='user' i] .name",
            ".user-name",
            ".profile-name",
            ".cabinet-user__name",
            "header .name",
            "[class*='profile' i] [class*='name' i]",
            "[class*='user' i] [class*='name' i]",
            "h1, h2, h3"
        ]
        try:
            script = """
                const sels = arguments[0];
                const out = [];
                for (const sel of sels) {
                  let nodes = [];
                  try { nodes = Array.from(document.querySelectorAll(sel)); } catch (e) {}
                  for (const n of nodes) {
                    const txt = (n.innerText || n.textContent || '').trim();
                    if (txt && txt.length >= 2) {
                      out.push({selector: sel, text: txt});
                    }
                  }
                }
                return out.slice(0, 10);
            """
            results = ctx.driver.execute_script(script, selectors) or []
            for r in results:
                meta["selectors"].append(r.get("selector"))
                meta["candidates"].append(r.get("text"))
            val = results[0]["text"] if results else None
            return val, meta
        except Exception as e:
            meta["error"] = str(e)
            return None, meta

    def _fallback_user_id_email(self, body_text: str) -> Tuple[Optional[str], Optional[str], Dict[str, Any]]:
        meta: Dict[str, Any] = {"regex": {}}
        email = None
        user_id = None
        try:
            m = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", body_text)
            if m:
                email = m.group(0)
            meta["regex"]["email_matched"] = bool(email)
        except Exception as e:
            meta["email_error"] = str(e)
        try:
            m2 = re.search(r"\b(?:id|ID)\s*([0-9]{5,})", body_text)
            if m2:
                user_id = m2.group(1)
            else:
                m3 = re.search(r"\b([0-9]{7,})\b", body_text)
                if m3:
                    user_id = m3.group(1)
            meta["regex"]["id_matched"] = bool(user_id)
        except Exception as e:
            meta["id_error"] = str(e)
        return user_id, email, meta

    def _fallback_nav_items(self, ctx: Ctx) -> Tuple[List[str], Dict[str, Any]]:
        meta: Dict[str, Any] = {"containers": []}
        try:
            script = """
                const containers = [
                  'aside',
                  'div[class*=\"menu\" i]',
                  'div[class*=\"profile\" i]',
                  'nav'
                ];
                const items = [];
                const seen = new Set();
                for (const csel of containers) {
                  let nodes = [];
                  try { nodes = Array.from(document.querySelectorAll(csel)); } catch (e) {}
                  for (const root of nodes) {
                    const btns = Array.from(root.querySelectorAll('a, button, [role=\"menuitem\"]'));
                    for (const b of btns) {
                      const t = (b.innerText || b.textContent || '').trim();
                      if (t && t.length >= 2 && !seen.has(t)) {
                        seen.add(t);
                        items.push(t);
                      }
                    }
                  }
                }
                return items.slice(0, 30);
            """
            items = ctx.driver.execute_script(script) or []
            meta["count"] = len(items)
            return items, meta
        except Exception as e:
            meta["error"] = str(e)
            return [], meta

    def _extract_balance_from_text(self, text: str) -> Tuple[Optional[float], Dict[str, Any]]:
        meta: Dict[str, Any] = {"patterns": []}
        try:
            # Pattern 1: Symbol $/€/£ followed by number
            m1 = re.search(r"([$€£])\s*([0-9]{1,3}(?:[ ,][0-9]{3})*(?:[.,][0-9]{2})?)", text)
            if m1:
                meta["patterns"].append("symbol")
                return self._parse_money(m1.group(1) + m1.group(2)), meta
            # Pattern 2: Currency code then number, possibly newline in between (e.g., 'USD\n48,282.49')
            m2 = re.search(r"\b(USD|EUR|GBP)\b[\s\r\n]*([0-9]{1,3}(?:[ ,][0-9]{3})*(?:[.,][0-9]{2})?)", text, re.IGNORECASE)
            if m2:
                meta["patterns"].append("code")
                return self._parse_money(m2.group(2)), meta
            # Pattern 3: Any number with typical money format as fallback
            m3 = re.search(r"([0-9]{1,3}(?:[ ,][0-9]{3})*(?:[.,][0-9]{2}))", text)
            if m3:
                meta["patterns"].append("generic")
                return self._parse_money(m3.group(1)), meta
        except Exception as e:
            meta["error"] = str(e)
        return None, meta

    def _infer_name_from_email_context(self, text: str, email: Optional[str]) -> Tuple[Optional[str], Dict[str, Any]]:
        meta: Dict[str, Any] = {"email": email}
        try:
            # If email known, take the non-empty line immediately above it
            if email:
                idx = text.find(email)
                if idx != -1:
                    head = text[:idx]
                    lines = [ln.strip() for ln in head.splitlines() if ln.strip()]
                    if lines:
                        candidate = lines[-1]
                        if "@" not in candidate and not re.search(r"\b(id|ID)\b", candidate) and len(candidate) >= 2:
                            meta["source"] = "preceding_line"
                            return candidate, meta
            # Otherwise, try to find a title-like line preceding 'Profile' or near 'Experience Points'
            m = re.search(r"([A-Z][^\r\n]{2,60})\s*\r?\n\s*(?:Profile|Experience Points)", text)
            if m:
                meta["source"] = "title_near_keywords"
                return m.group(1).strip(), meta
        except Exception as e:
            meta["error"] = str(e)
        return None, meta


# Factory
def build() -> Capability:
    return ProfileScan()




