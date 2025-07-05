# data/excel_to_json.py

import pandas as pd
import json
import os

def main():
    # 1. 定位文件路径
    base_dir   = os.path.dirname(__file__)
    excel_path = os.path.join(base_dir, "talentpolicy.xlsx")
    out_path   = os.path.join(base_dir, "subsidy.json")

    # 2. 读取 Excel，确保 sheet 名称正确
    df = pd.read_excel(excel_path, sheet_name="talentpolicy", dtype=str)

    records = []
    for _, row in df.iterrows():
        # 城市 / 区 / 学历
        city      = str(row.get("城市", "") or "").strip()
        district  = str(row.get("区", "") or "").strip()
        education = str(row.get("学历", "") or "").strip()

        # 直接从 validyears 列读取“有效年限”
        vy_raw    = row.get("validyears", "")
        try:
            validyears = int(float(vy_raw))
        except (ValueError, TypeError):
            # 无法解析为数字就跳过
            continue
        if validyears <= 0:
            continue

        # 发放频率列：只接受“年”或“月”
        freq = str(row.get("发放频率", "") or "").strip()
        if freq not in ("年", "月"):
            continue

        # 直接读取 Excel 中的“5年总金额”列
        amt_raw = row.get("5年总金额", "")
        try:
            total5 = float(amt_raw)
        except (ValueError, TypeError):
            continue
        if total5 <= 0:
            continue

        # 累加到记录列表
        records.append({
            "city":       city,
            "district":   district,
            "education":  education,
            "validyears": validyears,
            "freq":       freq,
            "total5Year": total5
        })

    # 3. 输出 JSON
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"✅ 已生成 {out_path}，共 {len(records)} 条记录")

if __name__ == "__main__":
    main()