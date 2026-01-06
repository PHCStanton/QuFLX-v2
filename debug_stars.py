from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import json

opts = Options()
opts.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
driver = webdriver.Chrome(options=opts)

# Try to find all star icons
star_sel = "i.alist__icon.fa.fa-star-o.add, i.alist__icon.fa.fa-star.del"
stars = driver.find_elements(By.CSS_SELECTOR, star_sel)

print(f"Found {len(stars)} stars total.")

results = []
for s in stars:
    try:
        class_attr = s.get_attribute("class")
        parent = s.find_element(By.XPATH, "..")
        # Try to find the asset name in the parent or siblings
        row = s.find_element(By.XPATH, "./ancestor::li[1]")
        asset_name = row.text.split('\n')[0] if row else "unknown"
        results.append({
            "asset": asset_name,
            "class": class_attr,
            "is_displayed": s.is_displayed()
        })
    except:
        continue

print(json.dumps(results, indent=2))
