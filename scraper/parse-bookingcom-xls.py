#!/usr/bin/env python3
"""
Parse Booking.com Excel export (.xls old format)
Extract: guest names, check-in/out dates, prices, countries, room types
Skip cancelled bookings
"""

import xlrd
import json
import sys
from datetime import datetime

def parse_bookingcom_excel(filepath):
    """Parse old-format Excel file from Booking.com"""
    
    try:
        workbook = xlrd.open_workbook(filepath)
        sheet = workbook.sheet_by_index(0)
    except Exception as e:
        print(f"❌ Error opening Excel file: {e}")
        return []
    
    bookings = []
    headers = {}
    
    # Find header row (usually row 0)
    for col_idx in range(sheet.ncols):
        header = str(sheet.cell_value(0, col_idx)).strip()
        headers[header.lower()] = col_idx
    
    print(f"📊 Found {sheet.nrows} rows, {sheet.ncols} columns")
    print(f"📋 Headers: {list(headers.keys())[:10]}")
    
    # Mapping of expected headers
    guest_col = headers.get('guest name(s)', headers.get('booked by', headers.get('guest', -1)))
    checkin_col = headers.get('check-in', headers.get('checkin', -1))
    checkout_col = headers.get('check-out', headers.get('checkout', -1))
    status_col = headers.get('status', -1)
    price_col = headers.get('price', headers.get('commission', -1))
    country_col = headers.get('booker country', headers.get('country', -1))
    room_col = headers.get('rooms', headers.get('unit type', -1))
    
    # Parse data rows (skip header)
    for row_idx in range(1, sheet.nrows):
        try:
            # Check status first - skip cancelled
            status = ''
            if status_col >= 0:
                status = str(sheet.cell_value(row_idx, status_col)).strip().lower()
            
            if 'cancel' in status:
                print(f"⏭️  Row {row_idx}: Skipped (cancelled)")
                continue
            
            # Extract guest name
            guest_name = ''
            if guest_col >= 0:
                guest_name = str(sheet.cell_value(row_idx, guest_col)).strip()
            
            if not guest_name or guest_name == '':
                continue
            
            # Extract check-in/out
            checkin = ''
            checkout = ''
            
            if checkin_col >= 0:
                cell = sheet.cell(row_idx, checkin_col)
                if cell.ctype == 3:  # Date type
                    date_tuple = xlrd.xldate_as_tuple(cell.value, workbook.datemode)
                    checkin = f"{date_tuple[0]}-{date_tuple[1]:02d}-{date_tuple[2]:02d}"
                else:
                    checkin = str(cell.value).strip()
            
            if checkout_col >= 0:
                cell = sheet.cell(row_idx, checkout_col)
                if cell.ctype == 3:  # Date type
                    date_tuple = xlrd.xldate_as_tuple(cell.value, workbook.datemode)
                    checkout = f"{date_tuple[0]}-{date_tuple[1]:02d}-{date_tuple[2]:02d}"
                else:
                    checkout = str(cell.value).strip()
            
            # Skip if no dates
            if not checkin or not checkout:
                continue
            
            # Extract country
            country = ''
            if country_col >= 0:
                country = str(sheet.cell_value(row_idx, country_col)).strip()
            
            # Extract room type
            room_type = 'unknown'
            if room_col >= 0:
                room = str(sheet.cell_value(row_idx, room_col)).strip().lower()
                if 'orange' in room:
                    room_type = 'orange'
                elif 'vintage' in room or 'vingtage' in room:
                    room_type = 'vintage'
                elif 'youth' in room:
                    room_type = 'youth'
                elif 'solo' in room or 'traveller' in room:
                    room_type = 'solo'
                elif 'awesome' in room:
                    room_type = 'awesome'
            
            # Extract price
            price = 0.0
            if price_col >= 0:
                try:
                    price_val = sheet.cell_value(row_idx, price_col)
                    if isinstance(price_val, (int, float)):
                        price = float(price_val)
                    else:
                        # Try parsing string like "375 EUR"
                        price_str = str(price_val).replace('EUR', '').replace(',', '.').strip()
                        if price_str:
                            price = float(price_str.split()[0])
                except:
                    pass
            
            booking = {
                'guest_name': guest_name,
                'check_in': checkin,
                'check_out': checkout,
                'country': country,
                'room_type': room_type,
                'price_eur': price,
                'platform': 'booking_com',
                'status': 'confirmed',
                'booking_type': 'reservation'
            }
            
            bookings.append(booking)
            print(f"✅ Row {row_idx}: {guest_name} | {checkin} → {checkout} | {country} | {room_type}")
            
        except Exception as e:
            print(f"⚠️  Row {row_idx}: Error - {e}")
            continue
    
    return bookings

if __name__ == '__main__':
    input_file = '/Users/greg/.openclaw/media/inbound/Check-in_2026-03-01_to_2026-11-30---9f7da9d7-f909-4162-a5a6-71a58c825740'
    
    print(f"📂 Parsing {input_file}\n")
    
    bookings = parse_bookingcom_excel(input_file)
    
    print(f"\n✅ Extracted {len(bookings)} bookings (skipped cancelled ones)\n")
    
    # Show first 5
    for i, b in enumerate(bookings[:5], 1):
        print(f"{i}. {b['guest_name']} ({b['country']}) | {b['check_in']} → {b['check_out']} | €{b['price_eur']} | {b['room_type']}")
    
    if len(bookings) > 5:
        print(f"... and {len(bookings) - 5} more")
    
    # Save to JSON
    output_file = '/Users/greg/.openclaw/workspace/booking-manager/scraper/bookingcom-export.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({
            'exported_at': datetime.now().isoformat(),
            'source': 'bookingcom_manual_export',
            'count': len(bookings),
            'bookings': bookings
        }, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Saved to {output_file}")
