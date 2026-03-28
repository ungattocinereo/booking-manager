/**
 * Booking.com Extranet Scraper
 * 
 * Scrapes reservation details from Booking.com Extranet
 * using a saved browser session (cookies).
 * 
 * Usage:
 *   node scraper/booking-scraper.js --save-session   # Login and save cookies
 *   node scraper/booking-scraper.js                   # Scrape using saved session
 * 
 * Requires: playwright
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, '.booking-session.json');
const OUTPUT_FILE = path.join(__dirname, 'booking-reservations.json');

// Booking.com Extranet URLs
const EXTRANET_URL = 'https://admin.booking.com';
const RESERVATIONS_URL = 'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/search_reservations.html';

async function saveSession() {
  console.log('🔐 Opening browser for manual login...');
  console.log('   Login to Booking.com Extranet, then close the browser.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(EXTRANET_URL);

  // Wait for user to login manually
  console.log('⏳ Waiting for login... (close browser when done)');

  await new Promise(resolve => {
    browser.on('disconnected', resolve);
    // Also check periodically if logged in
    const interval = setInterval(async () => {
      try {
        const url = page.url();
        if (url.includes('extranet_ng') || url.includes('hotel/hoteladmin')) {
          console.log('✅ Detected successful login!');
          clearInterval(interval);

          // Save cookies
          const cookies = await context.cookies();
          fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
          console.log(`💾 Session saved to ${SESSION_FILE}`);

          await browser.close();
          resolve();
        }
      } catch (e) {
        // Browser might be closed
        clearInterval(interval);
        resolve();
      }
    }, 2000);
  });
}

async function scrapeReservations() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error('❌ No saved session. Run with --save-session first.');
    process.exit(1);
  }

  console.log('🔄 Loading saved session...');
  const cookies = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies);

  const page = await context.newPage();

  try {
    console.log('📥 Loading reservations page...');
    await page.goto(RESERVATIONS_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Check if still logged in
    if (page.url().includes('login') || page.url().includes('sign-in')) {
      console.error('❌ Session expired. Run with --save-session to re-login.');
      await browser.close();
      process.exit(1);
    }

    console.log('📋 Scraping reservations...');

    // Wait for reservations table to load
    await page.waitForSelector('[data-testid="reservations-list"], .reservation-list, table', { timeout: 15000 });

    // Extract reservation data
    const reservations = await page.evaluate(() => {
      const results = [];
      
      // Try multiple selectors (Booking.com changes their UI)
      const rows = document.querySelectorAll(
        '[data-testid="reservation-row"], .reservation-row, tr[data-reservation-id], .bui-table__row'
      );

      rows.forEach(row => {
        try {
          const guestName = row.querySelector(
            '[data-testid="guest-name"], .guest-name, td:nth-child(2)'
          )?.textContent?.trim() || '';

          const checkIn = row.querySelector(
            '[data-testid="check-in"], .check-in, td:nth-child(3)'
          )?.textContent?.trim() || '';

          const checkOut = row.querySelector(
            '[data-testid="check-out"], .check-out, td:nth-child(4)'
          )?.textContent?.trim() || '';

          const roomName = row.querySelector(
            '[data-testid="room-name"], .room-name, td:nth-child(5)'
          )?.textContent?.trim() || '';

          const status = row.querySelector(
            '[data-testid="status"], .status, td:nth-child(6)'
          )?.textContent?.trim() || '';

          const reservationId = row.getAttribute('data-reservation-id') || 
            row.querySelector('a[href*="reservation"]')?.href?.match(/res_id=(\d+)/)?.[1] || '';

          if (guestName || checkIn) {
            results.push({
              guestName,
              checkIn,
              checkOut,
              roomName,
              status,
              reservationId,
              source: 'booking.com'
            });
          }
        } catch (e) {
          console.error('Error parsing row:', e);
        }
      });

      return results;
    });

    console.log(`✅ Found ${reservations.length} reservations`);

    // Save results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(reservations, null, 2));
    console.log(`💾 Saved to ${OUTPUT_FILE}`);

    // Also log summary
    reservations.forEach(r => {
      console.log(`  📌 ${r.guestName} | ${r.checkIn} → ${r.checkOut} | ${r.roomName} | ${r.status}`);
    });

    return reservations;

  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    
    // Take screenshot for debugging
    const screenshotPath = path.join(__dirname, 'debug-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Debug screenshot saved to ${screenshotPath}`);
    
    throw error;
  } finally {
    await browser.close();
  }
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--save-session')) {
  saveSession().catch(console.error);
} else {
  scrapeReservations().catch(console.error);
}
