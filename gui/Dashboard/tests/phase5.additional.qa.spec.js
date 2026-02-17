import { test, expect } from '@playwright/test';

const buildSettings = (overrides = {}) => ({
  version: 4,
  global: {
    theme: 'dark',
    language: 'en',
    autoStartCollector: true,
    autoStartGateway: true,
    debugLevel: 'info',
    sidebarSkinDataUrl: null,
    fontSize: 13,
    ...(overrides.global || {})
  },
  automation: {
    historyWaitTime: 1.5,
    linkTimeframeSync: false,
    retryAttempts: 2,
    retryDelay: 500,
    ...(overrides.automation || {})
  },
  analysis: {
    defaultTimeframe: '1m',
    chartPrecision: 5,
    autoLoadIndicators: false,
    indicatorPresetId: 'custom',
    dataSourceMode: 'history_and_streaming',
    ...(overrides.analysis || {})
  },
  ai: {
    responseVerbosity: 'balanced',
    autoIncludeChart: true,
    autoIncludeContext: true,
    imageSource: 'live',
    voiceInputMode: 'off',
    voiceReadBackEnabled: false,
    voiceReadBackMode: 'browser',
    voiceReadBackVoice: 'Ara',
    voiceReadBackRate: 1,
    voiceReadBackPitch: 1,
    voiceReadBackVoiceURI: null,
    customInstructions: '',
    ...(overrides.ai || {})
  },
  screenshot: {
    defaultTool: 'arrow',
    defaultColor: 'orange',
    defaultFontSize: 16,
    notesMarginEnabled: false,
    notesMarginWidth: 320,
    saveMode: 'full',
    emojiStripEnabled: false,
    ...(overrides.screenshot || {})
  },
  userProfile: {
    displayName: '',
    experienceLevel: 'intermediate',
    ...(overrides.userProfile || {})
  },
  riskManager: {
    dailyMaxTrades: 10,
    maxConsecutiveLosses: 3,
    dailyProfitTarget: 50,
    maxDrawdownPercent: 5,
    ...(overrides.riskManager || {})
  },
  alerts: {
    enableAIConfirm: false,
    minAIConfidence: 0.7,
    candleCount: 100,
    discordWebhookUrl: '',
    alertCooldownMinutes: 5,
    enableTickLogging: false,
    tickChunkSize: 1000,
    tickLoggingDir: 'data/ticks',
    ...(overrides.alerts || {})
  },
  calendarJournal: {},
  strategyLab: {},
  ...overrides
});

const createState = () => {
  const defaultSettings = buildSettings({ userProfile: { displayName: 'Default Trader' } });
  return {
    settings: defaultSettings,
    profiles: [
      {
        id: 'default',
        name: 'Default',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      }
    ],
    activeProfileId: 'default',
    profileSettings: {
      default: defaultSettings
    }
  };
};

const setupCoreRoutes = async (page, state) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('qa-init')) {
      localStorage.clear();
      sessionStorage.setItem('qa-init', '1');
    }
  });

  await page.route('**/api/v1/settings', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: state.settings });
      return;
    }
    if (method === 'PUT') {
      const payload = JSON.parse(route.request().postData() || '{}');
      state.settings = payload;
      await route.fulfill({ json: state.settings });
      return;
    }
    await route.fulfill({ json: state.settings });
  });

  await page.route('**/api/v1/profiles/active', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const profile = state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
      await route.fulfill({
        json: {
          activeProfileId: state.activeProfileId,
          profile: {
            ...profile,
            settings: state.profileSettings[profile.id] || state.settings
          }
        }
      });
      return;
    }
    const payload = JSON.parse(route.request().postData() || '{}');
    state.activeProfileId = payload.profileId || state.activeProfileId;
    const profile = state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
    await route.fulfill({
      json: {
        activeProfileId: state.activeProfileId,
        profile: {
          ...profile,
          settings: state.profileSettings[profile.id] || state.settings
        }
      }
    });
  });

  await page.route('**/api/v1/profiles', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { profiles: state.profiles } });
      return;
    }
    if (method === 'POST') {
      const payload = JSON.parse(route.request().postData() || '{}');
      const name = String(payload.name || 'Profile').trim();
      const id = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      const created = {
        id,
        name,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      };
      state.profiles.push(created);
      state.profileSettings[id] = payload.settings || buildSettings({ userProfile: { displayName: `${name} Trader` } });
      await route.fulfill({
        json: {
          ...created,
          settings: state.profileSettings[id]
        }
      });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.route('**/api/v1/profiles/*', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const profileId = url.pathname.split('/').pop();
    const existing = state.profiles.find((p) => p.id === profileId);
    if (!existing) {
      await route.fulfill({ status: 404, json: { detail: 'Profile not found' } });
      return;
    }
    if (method === 'PUT') {
      const payload = JSON.parse(route.request().postData() || '{}');
      const updated = {
        ...existing,
        name: payload.name || existing.name,
        updatedAt: '2026-01-02T00:00:00Z'
      };
      state.profiles = state.profiles.map((p) => (p.id === profileId ? updated : p));
      if (payload.settings) {
        state.profileSettings[profileId] = payload.settings;
      }
      await route.fulfill({ json: { ...updated, settings: state.profileSettings[profileId] } });
      return;
    }
    if (method === 'DELETE') {
      state.profiles = state.profiles.filter((p) => p.id !== profileId);
      delete state.profileSettings[profileId];
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ json: { ...existing, settings: state.profileSettings[profileId] } });
  });

  await page.route('**/api/v1/alerts/status', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        running: false,
        pid: null,
        started_at: null,
        assets: [],
        log_path: null
      }
    });
  });
};

const openSidebarTab = async (page, label) => {
  const labelLocator = page.getByText(label, { exact: true });
  const count = await labelLocator.count();
  if (count === 0) {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  }
  await expect(labelLocator).toBeVisible();
  await labelLocator.click();
};

test('Profiles flow updates active profile and display name', async ({ page }) => {
  const state = createState();
  await setupCoreRoutes(page, state);
  await page.goto('/');

  await page.getByRole('button', { name: /Profile|Trader/i }).click();
  await expect(page.getByText('Profiles', { exact: true })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept('Alpha'));
  const [createRequest, activateRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/api/v1/profiles') && req.method() === 'POST'),
    page.waitForRequest((req) => req.url().includes('/api/v1/profiles/active') && req.method() === 'POST'),
    page.getByRole('button', { name: 'New Profile' }).click()
  ]);

  const createPayload = JSON.parse(createRequest.postData() || '{}');
  const activatePayload = JSON.parse(activateRequest.postData() || '{}');
  expect(createPayload.name).toBe('Alpha');
  expect(activatePayload.profileId).toBe('alpha');
  expect(state.profiles.some((profile) => profile.name === 'Alpha')).toBe(true);
});

test('Settings persistence across reload', async ({ page }) => {
  const state = createState();
  await setupCoreRoutes(page, state);
  await page.goto('/');

  await openSidebarTab(page, 'Settings');
  await page.getByRole('button', { name: 'Global Settings' }).click();

  const themeSelect = page.getByText('Theme', { exact: true }).locator('..').locator('select');

  await Promise.all([
    page.waitForRequest((req) => req.url().includes('/api/v1/settings') && req.method() === 'PUT'),
    themeSelect.selectOption('ironman')
  ]);

  await page.reload();
  await openSidebarTab(page, 'Settings');
  await page.getByRole('button', { name: 'Global Settings' }).click();
  await expect(themeSelect).toHaveValue('ironman');
});

test('AI Insights send renders assistant response', async ({ page }) => {
  const state = createState();
  await setupCoreRoutes(page, state);

  await page.route('**/api/v1/ai/ask', async (route) => {
    await route.fulfill({
      json: {
        answer: 'Mocked response',
        meta: { ok: true, model: 'mock' }
      }
    });
  });

  await page.goto('/');
  await openSidebarTab(page, 'AI Insights');

  const prompt = page.getByPlaceholder('Type a follow-up question…');
  await prompt.fill('Test prompt');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('Mocked response')).toBeVisible();
});

test('Asset refresh shows new assets', async ({ page }) => {
  const state = createState();
  await setupCoreRoutes(page, state);

  await page.route('**/api/v1/assets/refresh-assets', async (route) => {
    await route.fulfill({
      json: {
        assets: ['EURUSDOTC', 'GBPUSDOTC'],
        metadata: {}
      }
    });
  });

  await page.goto('/');
  await page.evaluate(async () => {
    const mod = await import('/src/store/marketStore.js');
    const store = mod.default;
    const current = store.getState().backendStatus;
    store.setState({
      backendStatus: {
        ...current,
        readyForAssets: true,
        redisConnected: true,
        chromeDebuggingAvailable: true
      }
    });
  });

  await page.getByRole('button', { name: 'Get Assets' }).click();
  await expect(page.getByText('EURUSDOTC')).toBeVisible();
});

test('Alerts controls start and stop', async ({ page }) => {
  const state = createState();
  await setupCoreRoutes(page, state);

  await page.route('**/api/v1/alerts/start', async (route) => {
    await route.fulfill({
      json: {
        pid: 1234,
        started_at: '2026-01-01T00:00:00Z'
      }
    });
  });

  await page.route('**/api/v1/alerts/stop', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'START' }).click();
  await expect(page.getByText('PID: 1234')).toBeVisible();

  await page.getByRole('button', { name: 'STOP' }).click();
  await expect(page.getByText('PID: 1234')).toHaveCount(0);
});

test('Monitoring pool remove and clear actions update list', async ({ page }) => {
  const state = createState();
  await setupCoreRoutes(page, state);

  await page.goto('/');
  await page.evaluate(async () => {
    const mod = await import('/src/store/marketStore.js');
    const store = mod.default;
    store.setState({
      activeTab: 'analysis',
      monitoringAssetKeys: ['EURUSDOTC', 'GBPUSDOTC'],
      selectedAssetKey: ''
    });
  });

  await page.getByRole('button', { name: 'Monitoring Pool' }).click();
  const pool = page.getByTestId('monitoring-pool');
  await expect(pool.getByText('EURUSDOTC')).toBeVisible();

  await pool.getByRole('button', { name: 'Remove EURUSDOTC' }).click();
  await expect(pool.getByText('EURUSDOTC')).toHaveCount(0);

  page.once('dialog', (dialog) => dialog.accept());
  await pool.getByRole('button', { name: 'Clear Monitor Pool', exact: true }).click();
  await expect(pool.getByText('GBPUSDOTC')).toHaveCount(0);
});

test('Screenshot annotation controls update and close', async ({ page }) => {
  const state = createState();
  await setupCoreRoutes(page, state);

  await page.goto('/');
  await page.getByTitle('Capture chart screenshot').click();
  await expect(page.getByText('Chart Screenshot')).toBeVisible();

  await page.getByLabel('Color').selectOption('blue');
  await page.getByLabel('Font size').selectOption('20');
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByText('Chart Screenshot')).toHaveCount(0);
});

test('Right panel resize persists width', async ({ page }) => {
  const state = createState();
  await setupCoreRoutes(page, state);

  await page.goto('/');
  const before = await page.evaluate(() => localStorage.getItem('quflx.ui.rightPanelWidthPx'));

  const handle = page.locator('[role="separator"]');
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Resize handle not found');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y + box.height / 2);
  await page.mouse.up();

  const after = await page.evaluate(() => localStorage.getItem('quflx.ui.rightPanelWidthPx'));
  expect(after).not.toBeNull();
  expect(after).not.toEqual(before);

  await page.reload();
  const persisted = await page.evaluate(() => localStorage.getItem('quflx.ui.rightPanelWidthPx'));
  expect(persisted).toEqual(after);
});

test('Error toast appears for timeframe failure', async ({ page }) => {
  const state = createState();
  await setupCoreRoutes(page, state);

  await page.route('**/api/v1/timeframe/select-timeframe', async (route) => {
    await route.fulfill({ status: 500, json: { detail: 'Backend down' } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '1 Minute' }).click();
  await page.getByText('5 Minutes', { exact: true }).click();

  const toast = page.locator('div.fixed.bottom-4').getByText('Backend down');
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 10000 });
});
