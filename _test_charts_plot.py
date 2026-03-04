"""Test script to generate Matplotlib charts for the Opportunity Tracker PDF."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import json

from parser_universal import parse_file

# --- 1. Load sample data
print("Parsing Excel...")
d = parse_file(r'New info\MEA Profit Opportunities Tracker 21.04.xlsx', filename='OPP')

def _val(v):
    if v is None: return 0.0
    try:
        if isinstance(v, str):
            v = v.replace(",", "").replace("$", "").replace("\u20ac", "").replace("\u00a3", "")
        return float(v)
    except: return 0.0

# Extract and flatten records
all_items = []
for sheet_name, recs in d.get('opportunities', {}).items():
    if isinstance(recs, list):
        for r in recs:
            all_items.append({**r, "_sheet": sheet_name})

filtered = [r for r in all_items if _val(r.get("sum_26_27")) > 0] # non-zero for charts

# --- 2. Chart Generator Function
def create_charts(records):
    """Generate a horizontal strip of 3 styling charts."""
    # Colors matching PDF palette
    NAVY    = '#03002e'
    ACCENT  = '#10069f'
    GREEN   = '#00c875'
    AMBER   = '#ffb300'
    CYAN    = '#00c8ff'
    GREY    = '#828296'
    
    plt.style.use('default')
    # Use a wide setup to fit 3 charts side by side (e.g., across the A4 page width)
    fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(11, 3.5), dpi=150)
    fig.patch.set_facecolor('white')
    
    # helper to clean up spines
    def clean_ax(ax):
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color('#E8E8EE')
        ax.spines['bottom'].set_color('#E8E8EE')
        ax.tick_params(colors=GREY, labelsize=8)
        ax.title.set_color(NAVY)
        ax.title.set_fontsize(10)
        ax.title.set_weight('bold')

    # CHART 1: Priority Doughnut
    by_priority = {}
    for r in records:
        p = str(r.get('priority', '?')).replace('.0', '')
        if p in ('', 'None', 'nan'): p = '?'
        if p == '?': continue
        by_priority[p] = by_priority.get(p, 0) + _val(r.get('sum_26_27'))
    
    # Sort keys 1, 2, 3
    p_keys = sorted(by_priority.keys())
    p_vals = [by_priority[k] for k in p_keys]
    p_labels = [f"Priority {k}" for k in p_keys]
    
    # Map colors: 1=GREEN, 2=ACCENT, 3=AMBER, else=CYAN
    color_map = {'1': GREEN, '2': ACCENT, '3': AMBER}
    p_colors = [color_map.get(k, CYAN) for k in p_keys]
    
    if sum(p_vals) > 0:
        wedges, texts, autotexts = ax1.pie(
            p_vals, labels=p_labels, autopct='%1.0f%%', 
            colors=p_colors, startangle=90,
            textprops={'color': NAVY, 'fontsize': 8, 'weight': 'bold'},
            wedgeprops={'width': 0.4, 'edgecolor': 'white', 'linewidth': 2}
        )
        for autotext in autotexts:
            autotext.set_color('white')
            autotext.set_weight('bold')
    ax1.set_title("Value by Priority (26+27)")

    # CHART 2: Estimation Level Bar Chart
    by_level = {}
    for r in records:
        sh = r.get('_sheet', 'Unknown')
        by_level[sh] = by_level.get(sh, 0) + _val(r.get('sum_26_27'))
    
    # Sort by value
    l_sorted = sorted(by_level.items(), key=lambda x: x[1], reverse=True)
    l_names = [x[0] for x in l_sorted]
    l_vals = [x[1] for x in l_sorted]
    
    clean_ax(ax2)
    # Different shades of primary color
    bars = ax2.bar(l_names, l_vals, color=ACCENT, alpha=0.9, width=0.6)
    
    # Add value labels on top of bars
    for bar in bars:
        h = bar.get_height()
        ax2.annotate(f"${h:,.0f}m",
                     xy=(bar.get_x() + bar.get_width() / 2, h),
                     xytext=(0, 3),  # 3 points vertical offset
                     textcoords="offset points",
                     ha='center', va='bottom', fontsize=7, color=NAVY, weight='bold')

    ax2.set_title("Value by Source (26+27)")
    ax2.set_yticks([]) # Hide y axis values since we have annotations
    ax2.spines['left'].set_visible(False)

    # CHART 3: Top Customers Horizontal Bar
    by_cust = {}
    for r in records:
        c = r.get('customer', 'Unknown')
        if not c or c.lower() == 'nan': continue
        by_cust[c] = by_cust.get(c, 0) + _val(r.get('sum_26_27'))
    
    # Top 5 customers
    c_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)[:5]
    # Reverse so top is at top of horizontal layout
    c_sorted.reverse()
    c_names = [x[0][:15] for x in c_sorted] # truncate names
    c_vals = [x[1] for x in c_sorted]
    
    clean_ax(ax3)
    bars_h = ax3.barh(c_names, c_vals, color=GREEN, alpha=0.9, height=0.6)
    
    # Value labels
    for bar in bars_h:
        w = bar.get_width()
        ax3.annotate(f"${w:,.0f}m",
                     xy=(w, bar.get_y() + bar.get_height() / 2),
                     xytext=(3, 0),  
                     textcoords="offset points",
                     ha='left', va='center', fontsize=7, color=NAVY, weight='bold')
                     
    ax3.set_title("Top 5 Customers by Value")
    ax3.set_xticks([])
    ax3.spines['bottom'].set_visible(False)

    plt.tight_layout(pad=2.0)
    
    # Save to buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    
    # Also save to disk just so we can look at it during testing
    plt.savefig('_test_charts.png', format='png', bbox_inches='tight', dpi=150)
    plt.close(fig)
    
    buf.seek(0)
    return buf

print("Generating charts...")
buf = create_charts(filtered)
print(f"Chart generated. Size: {len(buf.getvalue())} bytes.")
print("Saved to _test_charts.png for manual inspection.")
