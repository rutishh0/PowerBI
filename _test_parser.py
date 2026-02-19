"""Write parser output for all 5 file types to a JSON file for inspection."""
from parser_universal import parse_file
import json, sys

files = [
    ("SOA", r"New info\ETH SOA 30.1.26.xlsx"),
    ("EPI", r"New info\EPI 16.02.xlsx"),
    ("OPP", r"New info\MEA Profit Opportunities Tracker 21.04.xlsx"),
    ("SV",  r"New info\SV008RV08_Trent 900 Shop Visit History Report incl SV Type and Location 2026-02-09T07_40_12.771Z (3).xlsx"),
    ("SVRG", r"New info\VERSION 2 Enhanced SVRG MASTER FILE (version 1).xlsb LOCAL.xlsx"),
]

results = {}
for label, path in files:
    try:
        r = parse_file(path, filename=label)
        results[label] = r
        print(f"OK: {label} -> {r.get('file_type')}")
    except Exception as e:
        results[label] = {"error": str(e)}
        print(f"ERR: {label} -> {e}")
    sys.stdout.flush()

# Write to file, truncating large arrays for readability
def truncate(obj, max_items=3, depth=0):
    if depth > 4:
        return "..."
    if isinstance(obj, dict):
        return {k: truncate(v, max_items, depth+1) for k, v in obj.items()}
    elif isinstance(obj, list):
        if len(obj) > max_items:
            return [truncate(x, max_items, depth+1) for x in obj[:max_items]] + [f"...{len(obj)-max_items} more"]
        return [truncate(x, max_items, depth+1) for x in obj]
    return obj

with open("_parser_output.json", "w") as f:
    json.dump(truncate(results), f, indent=2, default=str)
print("Written to _parser_output.json")
