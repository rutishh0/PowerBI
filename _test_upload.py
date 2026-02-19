"""Upload a test file to the API and check the response."""
import requests, json, sys

# Login first
session = requests.Session()
login = session.post("http://localhost:5000/api/login", json={"password": "rollsroyce"})
print(f"Login: {login.status_code}")

# Upload a file
fpath = r"New info\ETH SOA 30.1.26.xlsx"
with open(fpath, "rb") as f:
    resp = session.post("http://localhost:5000/api/upload", 
                        files={"files": ("ETH_SOA.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})

print(f"Upload: status={resp.status_code}")
if resp.status_code != 200:
    print(f"Error body: {resp.text[:500]}")
    sys.exit(1)

data = resp.json()
files = data.get("files", {})
errors = data.get("errors", [])

print(f"Files returned: {list(files.keys())}")
print(f"Errors: {errors}")

for fname, fdata in files.items():
    print(f"\n=== {fname} ===")
    print(f"  file_type: {fdata.get('file_type', 'MISSING!')}")
    print(f"  top keys: {sorted(fdata.keys())}")
    
    if fdata.get("file_type") == "SOA":
        meta = fdata.get("metadata", {})
        print(f"  customer: {meta.get('customer_name')}")
        secs = fdata.get("sections", [])
        print(f"  sections: {len(secs)}")
        for s in secs[:3]:
            print(f"    - {s.get('name')}: items={len(s.get('items',[]))}, total={s.get('total')}")
        aging = fdata.get("aging_buckets", {})
        print(f"  aging_buckets: {aging}")
        grand = fdata.get("grand_totals", {})
        print(f"  grand_totals: {grand}")

print("\nDONE")
