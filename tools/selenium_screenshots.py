"""Selenium screenshot tour of IntelliSDLC.

Opens a visible Chrome window, signs in with a seeded demo account, visits
every page and saves a screenshot of each to tools/selenium_screenshots/.
Each screenshot carries a footer naming Selenium, the browser, the URL and
the time, and every step is written to selenium_run_log.txt.

Run with the backend (port 8000) and frontend (port 5173) already started:
    backend\\.venv\\Scripts\\python.exe tools\\selenium_screenshots.py
"""

import time
from datetime import datetime
from pathlib import Path

import selenium
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE_URL = "http://localhost:5173"
OUT_DIR = Path(__file__).parent / "selenium_screenshots"
LOG_FILE = OUT_DIR / "selenium_run_log.txt"

PAGES = [
    ("02_dashboard", "/"),
    ("03_projects", "/projects"),
    ("04_requirements", "/requirements"),
    ("05_sprints", "/sprints"),
    ("06_bugs", "/bugs"),
    ("07_test_cases", "/test-cases"),
    ("08_code", "/code"),
    ("09_deployments", "/deployments"),
    ("10_traceability", "/traceability"),
    ("11_risk", "/risk"),
    ("12_ai_chat", "/chat"),
]

# Footer injected into the page just before each screenshot
STAMP_JS = """
const old = document.getElementById('selenium-stamp');
if (old) old.remove();
const bar = document.createElement('div');
bar.id = 'selenium-stamp';
bar.textContent = arguments[0];
bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;'
  + 'background:#111827;color:#fbbf24;font:13px Consolas,monospace;padding:6px 12px;';
document.body.appendChild(bar);
"""


def log(line: str) -> None:
    entry = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {line}"
    print(entry)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(entry + "\n")


def take(driver, name: str, browser: str) -> None:
    stamp = (
        f"Captured by Selenium WebDriver {selenium.__version__} | {browser} | "
        f"{driver.current_url} | {datetime.now():%d-%m-%Y %H:%M:%S}"
    )
    driver.execute_script(STAMP_JS, stamp)
    driver.save_screenshot(str(OUT_DIR / f"{name}.png"))
    log(f"Screenshot saved: {name}.png  ({driver.current_url})")


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    LOG_FILE.write_text("", encoding="utf-8")

    options = webdriver.ChromeOptions()
    options.add_argument("--window-size=1440,900")
    driver = webdriver.Chrome(options=options)  # Selenium Manager fetches chromedriver
    wait = WebDriverWait(driver, 15)
    caps = driver.capabilities
    browser = f"{caps['browserName'].title()} {caps['browserVersion']}"
    log(f"Selenium {selenium.__version__} started {browser} "
        f"(ChromeDriver {caps['chrome']['chromedriverVersion'].split()[0]})")

    try:
        # Login page
        driver.get(f"{BASE_URL}/login")
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type=email]")))
        log(f"Opened {driver.current_url} - page title '{driver.title}'")
        time.sleep(1)
        take(driver, "01_login", browser)

        # Sign in by clicking the "Admin" demo-account card on the login page
        admin_card = wait.until(
            EC.element_to_be_clickable((By.XPATH, "//*[normalize-space(text())='Admin']"))
        )
        admin_card.click()
        log("Clicked 'Admin' demo account")
        try:
            wait.until(EC.presence_of_element_located((By.TAG_NAME, "main")))
        except Exception:
            take(driver, "login_failed", browser)
            log("FAIL: sign-in did not reach the dashboard")
            raise
        log("PASS: signed in, dashboard loaded")

        # Every page after sign-in
        for name, path in PAGES:
            driver.get(f"{BASE_URL}{path}")
            wait.until(EC.presence_of_element_located((By.TAG_NAME, "main")))
            time.sleep(2)  # let charts and API data finish rendering
            heading = driver.find_elements(By.TAG_NAME, "h1")
            log(f"PASS: {path} loaded - heading '{heading[0].text if heading else '-'}'")
            take(driver, name, browser)

        log(f"Done. {len(PAGES) + 1} screenshots in {OUT_DIR}")
        time.sleep(2)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
