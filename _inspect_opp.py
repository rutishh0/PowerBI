"""Dump first record + estimation levels + summary for the opp tracker."""
from parser_universal import parse_file
import json

d = parse_file(r'New info\MEA Profit Opportunities Tracker 21.04.xlsx', filename='OPP')

recs = []
for sheet, items in d.get('opportunities', {}).items():
    if isinstance(items, list):
        for item in items:
            item['_sheet'] = sheet
        recs.extend(items)

# First record
print("=== FIRST RECORD ===")
print(json.dumps(recs[0], indent=2, default=str))

# Aggregations
total_2026 = sum(r.get('benefit_2026') or 0 for r in recs if isinstance(r.get('benefit_2026'), (int, float)))
total_2027 = sum(r.get('benefit_2027') or 0 for r in recs if isinstance(r.get('benefit_2027'), (int, float)))
total_sum = sum(r.get('sum_26_27') or 0 for r in recs if isinstance(r.get('sum_26_27'), (int, float)))
total_term = sum(r.get('term_benefit') or 0 for r in recs if isinstance(r.get('term_benefit'), (int, float)))

print(f"\n=== FINANCIAL TOTALS ===")
print(f"  2026: {total_2026}")
print(f"  2027: {total_2027}")
print(f"  26+27: {total_sum}")
print(f"  Term: {total_term}")

# By priority
by_priority = {}
for r in recs:
    p = str(r.get('priority', '?'))
    by_priority.setdefault(p, {'count': 0, 'term': 0, 'sum_26_27': 0})
    by_priority[p]['count'] += 1
    by_priority[p]['term'] += r.get('term_benefit') or 0
    by_priority[p]['sum_26_27'] += r.get('sum_26_27') or 0
print(f"\n=== BY PRIORITY ===")
print(json.dumps(by_priority, indent=2, default=str))

# By ext probability
by_prob = {}
for r in recs:
    p = str(r.get('ext_probability', '?'))
    by_prob.setdefault(p, {'count': 0, 'sum_26_27': 0})
    by_prob[p]['count'] += 1
    by_prob[p]['sum_26_27'] += r.get('sum_26_27') or 0
print(f"\n=== BY EXT PROBABILITY ===")
print(json.dumps(by_prob, indent=2, default=str))

# Est levels
print(f"\n=== ESTIMATION LEVELS ===")
print(json.dumps(d['summary'].get('estimation_level_sums', {}), indent=2, default=str))

# Customer analytics sample
ca = d.get('customer_analytics', {})
custs = ca.get('customers', [])
if custs:
    print(f"\n=== CUSTOMER ANALYTICS SAMPLE ===")
    print(json.dumps(custs[0], indent=2, default=str))
    print(f"Total customer entries: {len(custs)}")

# Project summary
ps = d.get('project_summary', {})
projs = ps.get('projects', [])
if projs:
    print(f"\n=== PROJECT SUMMARY SAMPLE ===")
    print(json.dumps(projs[0], indent=2, default=str))
    print(f"Total projects: {len(projs)}")

# Opps and threats
ot = d.get('opps_and_threats', {})
items = ot.get('items', [])
if items:
    print(f"\n=== OPPS AND THREATS SAMPLE ===")
    print(json.dumps(items[0], indent=2, default=str))
    print(f"Total items: {len(items)}")

# Timeline milestones sample
tm = d.get('timeline', {})
ms = tm.get('milestones', [])
if ms:
    print(f"\n=== MILESTONE SAMPLE ===")
    print(json.dumps(ms[0], indent=2, default=str))
    print(f"Total milestones: {len(ms)}")

print("\n=== RECORD KEYS ===")
print(sorted(recs[0].keys()))
