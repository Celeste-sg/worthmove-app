"use client";
import subsidyData from "../data/subsidy.json";

/**
 * 计算指定城市 / 区域 / 学历在 5 年内能拿到的总补贴
 * 逻辑：
 * 1. 只有当年龄 < 40 岁时，调用者才会执行本函数（外层已判断）。
 * 2. 同一城市可能有两条记录：发放频率 = “月” 和 “年”。
 *    需要把这两条的「5年总金额」相加。
 * 3. 区域选择：
 *    • 若用户选 “全部”，只匹配 r.district === "全部"
 *    • 若用户选具体区，则同时匹配 r.district === 该区 以及 r.district === "全部"
 */
function calcSubsidyTotal(city, district, education, gradDate) {
  const gradYear = gradDate && gradDate.length >= 4 ? parseInt(gradDate.slice(0, 4), 10) : NaN;
  const nowYear  = new Date().getFullYear();
  const diffYear = nowYear - gradYear;
  const normDist = (district === "全部区" || !district) ? "全部" : district;

  const match = (r) => {
    if (r.city !== city) return false;
    // 区域过滤
    if (normDist === "全部") {
      if (r.district !== "全部") return false;
    } else {
      if (!(r.district === normDist || r.district === "全部")) return false;
    }
    if (r.education !== education) return false;
    if (diffYear > r.validyears)  return false;
    return true;
  };

  // 找到月补贴 & 年补贴，两者可能都存在，也可能只存在其一
  let yearTotal  = 0; // 年度补贴仍按加总
  let monthTotal = 0; // 月度补贴取“最高”那条

  subsidyData.forEach((r) => {
    if (!match(r)) return;

    const val = Number(r.total5Year || 0);

    if (r.freq === "年") {
      yearTotal += val;               // 多条年的仍累加
    } else if (r.freq === "月") {
      monthTotal = Math.max(monthTotal, val); // 取最高月度补贴
    }
  });
  return {
    total: yearTotal + monthTotal,
    monthTotal,
    yearTotal,
  };
}

import React, { useState, useMemo } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Legend,
} from "recharts";

// 自定义刻度，支持换行并加大行间距
const MultiLineTick = ({ x, y, textAnchor, payload, fill }) => {
  const lines = String(payload.value).split("\n");
  const lineHeight = 16;              // 调整此值即可改变行间距
  // 使多行文本整体垂直居中
  const startY = y - ((lines.length - 1) * lineHeight) / 2;

  return (
    <text x={x} y={startY} textAnchor={textAnchor} fill={fill}>
      {lines.map((line, idx) => (
        <tspan
          key={idx}
          x={x}
          dy={idx === 0 ? 0 : lineHeight}
          fontSize={14}               // 如需更小字体可调整
        >
          {line}
        </tspan>
      ))}
    </text>
  );
};


// 购买力平价 (PPP) 映射（以中国人民币为基准，1美元=4.19人民币 PPP）
const pppRates = {
  人民币: 1,          // base
  美元: 4.19,         // 1 USD buys same as 4.19 CNY in China
  新加坡元: 3.30,     // approximate PPP
  欧元: 5.00,         // approximate PPP
  澳元: 3.20          // approximate PPP
};

// 定义新加坡个人所得税税率档
const SINGAPORE_TAX_BRACKETS = [
  { threshold: 20000,  rate: 0    },  // 首 S$20,000 @ 0%
  { threshold: 30000,  rate: 0.02 },  // S$20,001–30,000 @ 2%
  { threshold: 40000,  rate: 0.035},  // S$30,001–40,000 @ 3.5%
  { threshold: 80000,  rate: 0.07 },  // S$40,001–80,000 @ 7%
  { threshold: 120000, rate: 0.115},  // S$80,001–120,000 @ 11.5%
  { threshold: 160000, rate: 0.15 },  // S$120,001–160,000 @ 15%
  { threshold: 200000, rate: 0.18 },  // S$160,001–200,000 @ 18%
  { threshold: 240000, rate: 0.19 },  // S$200,001–240,000 @ 19%
  { threshold: 280000, rate: 0.195},  // S$240,001–280,000 @ 19.5%
  { threshold: 320000, rate: 0.20 },  // S$280,001–320,000 @ 20%
  { threshold: 500000, rate: 0.22 },  // S$320,001–500,000 @ 22%
  { threshold:1000000, rate: 0.23 },  // S$500,001–1,000,000 @ 23%
  { threshold: Infinity, rate: 0.24 } // >S$1,000,000 @ 24%
]

/**
 * 计算新加坡年度税款
 * @param {number} incomeSGD - 年度应纳税所得额（新加坡元）
 * @returns {number} 应缴税额（新加坡元，未做四舍五入）
 */
function calculateSingaporeTax(incomeSGD) {
  let remaining = incomeSGD
  let prevThresh = 0
  let tax = 0

  for (const { threshold, rate } of SINGAPORE_TAX_BRACKETS) {
    if (remaining <= 0) break

    // 本级距应税收入 = min(remaining, threshold - prevThresh)
    const slabAmount = Math.min(remaining, threshold - prevThresh)
    tax += slabAmount * rate

    remaining -= slabAmount
    prevThresh = threshold
  }
  return tax
}

// 2024 年美国联邦个人所得税率（单身申报）
const US_TAX_BRACKETS_2024 = [
  { threshold:   11600, rate: 0.10 },  // $0       – $11,600 @ 10%
  { threshold:   47150, rate: 0.12 },  // $11,601  – $47,150 @ 12%
  { threshold:  100525, rate: 0.22 },  // $47,151  – $100,525 @ 22%
  { threshold:  191950, rate: 0.24 },  // $100,526 – $191,950 @ 24%
  { threshold:  243725, rate: 0.32 },  // $191,951 – $243,725 @ 32%
  { threshold:  609350, rate: 0.35 },  // $243,726 – $609,350 @ 35%
  { threshold:      Infinity, rate: 0.37 } // $609,351 及以上 @ 37%
];

/**
 * 计算 2024 年美国联邦个人所得税（单身申报）
 * @param {number} taxableIncome - 年度应纳税所得额（美元）
 * @returns {number} 应缴税额（美元）
 */
function calculateUSTax2024(taxableIncome) {
  let remaining = taxableIncome;
  let prevThreshold = 0;
  let tax = 0;

  for (const { threshold, rate } of US_TAX_BRACKETS_2024) {
    if (remaining <= 0) break;

    // 本档应税部分 = min(remaining, threshold - prevThreshold)
    const slab = Math.min(remaining, threshold - prevThreshold);
    tax += slab * rate;

    remaining -= slab;
    prevThreshold = threshold;
  }
  return tax;
}
// —— 澳大利亚税（2023–24 居民税率）  [oai_citation:0‡ato.gov.au](https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents?utm_source=chatgpt.com)
function calculateAustraliaTax(incomeAUD) {
  let tax = 0;
  if (incomeAUD <= 18200) {
    return 0;
  }
  // 18,201 – 45,000 @ 19c
  if (incomeAUD <= 45000) {
    return (incomeAUD - 18200) * 0.19;
  }
  tax += (45000 - 18200) * 0.19;
  // 45,001 – 120,000 @ 32.5c
  if (incomeAUD <= 120000) {
    return tax + (incomeAUD - 45000) * 0.325;
  }
  tax += (120000 - 45000) * 0.325;
  // 120,001 – 180,000 @ 37c
  if (incomeAUD <= 180000) {
    return tax + (incomeAUD - 120000) * 0.37;
  }
  tax += (180000 - 120000) * 0.37;
  // >180,000 @ 45c
  return tax + (incomeAUD - 180000) * 0.45;
}

// —— 德国税(欧洲税）（2024 单身税率简化版）  [oai_citation:1‡taxsummaries.pwc.com](https://taxsummaries.pwc.com/germany/individual/taxes-on-personal-income?utm_source=chatgpt.com)
function calculateGermanyTax(incomeEUR) {
  let tax = 0;
  if (incomeEUR <= 11604) {
    return 0;
  }
  // 11,605 – 66,760 @ 14%
  tax += (Math.min(incomeEUR, 66760) - 11604) * 0.14;
  // 66,761 – 277,825 @ 42%
  if (incomeEUR > 66760) {
    tax +=
      (Math.min(incomeEUR, 277825) - 66760) * 0.42;
  }
  // >277,826 @ 45%
  if (incomeEUR > 277825) {
    tax += (incomeEUR - 277825) * 0.45;
  }
  return tax;
}

// 社保/公积金费率示例（杭州/苏州/广州）
const CN_SI_HF = {
  杭州: {
    baseMin: 4411,
    baseMax: 24066,
    fundMin: 2480,
    fundMax: 36675,
    fundRate: 0.12,
    rate: {
      pension: [0.14, 0.08],
      medical: [0.095, 0.02],
      unemploy: [0.005, 0.005],
      injury: [0.002, 0],
      maternity: [0, 0],
    },
  },
  苏州: {
    baseMin: 4494,
    baseMax: 24420,
    fundMin: 2490,
    fundMax: 36300,
    fundRate: 0.12,
    rate: {
      pension: [0.16, 0.08],
      medical: [0.07, 0.02],
      unemploy: [0.005, 0.005],
      injury: [0.002, 0],
      maternity: [0.008, 0],
    },
  },
  广州: {
    baseMin: 5283,
    baseMax: 26415,
    fundMin: 2300,
    fundMax: 38090,
    fundRate: 0.12,
    rate: {
      pension: [0.14, 0.08],
      medical: [0.0685, 0.02],
      unemploy: [0.008, 0.002],
      injury: [0.002, 0],
      maternity: [0.008, 0],
    },
  },
};

// 五险一金
function calcSIHF(city, gross) {
  const c = CN_SI_HF[city] || CN_SI_HF["杭州"];
  const sb = Math.min(Math.max(gross, c.baseMin), c.baseMax);
  const hf = Math.min(Math.max(gross, c.fundMin), c.fundMax);
  const r = c.rate;
  return (
    sb *
      (r.pension[1] +
        r.medical[1] +
        r.unemploy[1] +
        r.injury[1] +
        r.maternity[1]) +
    hf * c.fundRate
  );
}

// 中国超额累进税率
function calcChinaTax(taxable) {
  const table = [
    [36000, 0.03, 0],
    [144000, 0.1, 2520],
    [300000, 0.2, 16920],
    [420000, 0.25, 31920],
    [660000, 0.3, 52920],
    [960000, 0.35, 85920],
    [Infinity, 0.45, 181920],
  ];
  const bracket = table.find(([up]) => taxable <= up);
  return bracket ? taxable * bracket[1] - bracket[2] : 0;
}

/**
 * 计算海外税后年收入（本币单位）
 * @param {number} annualGross - 年度税前收入（本币单位）
 * @param {string} currency - 币种（人民币/新加坡元/美元/欧元/澳元）
 * @returns {number} 税后年收入（本币单位）
 */
function calcOverseasTax(annualGross, currency) {
  let tax = 0;
  switch (currency) {
    case "人民币":
      tax = calcChinaTax(annualGross);
      break;
    case "新加坡元":
      tax = calculateSingaporeTax(annualGross * 0.63);
      break;
    case "美元":
      tax = calculateUSTax2024(annualGross);
      break;
    case "欧元":
      tax = calculateGermanyTax(annualGross);
      break;
    case "澳元":
      tax = calculateAustraliaTax(annualGross);
      break;
    default:
      throw new Error(`Unsupported currency: ${currency}`);
  }
  return tax;
}

// 假期与工时映射
const holidayOptions = [
  "双休+朝九晚五",
  "双休-朝九晚五",
  "大小休+朝九晚五",
  "大小休-朝九晚五",
  "单休+朝九晚五",
  "单休-朝九晚五",
];
const hoursMap = {
  "双休+朝九晚五": 160,
  "双休-朝九晚五": 240,
  "大小休+朝九晚五": 176,
  "大小休-朝九晚五": 264,
  "单休+朝九晚五": 192,
  "单休-朝九晚五": 288,
};

// 问卷题目与选项（必填）
const questionnaire = [
  {
    key: "q1",
    title: "媒体消费／Media",
    opts: [
      { v: "A", text: "A. 我订阅或至少每天阅读海外媒体如WSJ，NYT，Bloomberg的原文文章。" },
      { v: "B", text: "B. 我每天主要使用X，TikTok，YouTube等海外媒体获取新闻。" },
      { v: "C", text: "C. 我习惯阅读简体中文媒体：财新、三联生活周刊等。" },
      { v: "D", text: "D. 我每天只使用抖音、小红书、微信公众号、微博获取新闻。" },
    ],
  },
  {
    key: "q2",
    title: "社交网络／Social",
    opts: [
      { v: "A", text: "A. 我在 Reddit／X 上活跃，常参与讨论。" },
      { v: "B", text: "B. 我只关注一些中立的 LinkedIn 专业社区。" },
      { v: "C", text: "C. 我主要在小红书／抖音看内容，不发声。" },
      { v: "D", text: "D. 我只跟亲友在微信群里分享观点。" },
    ],
  },
  {
    key: "q3",
    title: "价值观态度／Values",
    opts: [
      { v: "A", text: "A. “言论自由” 是我最看重的价值。" },
      { v: "B", text: "B. 社会福利不会造成养懒汉现象，而是一种政府责任的表现。" },
      { v: "C", text: "C. 集体利益应该高于个体利益。" },
      { v: "D", text: "D. 民主自由迟早要完，稳定压倒一切。" },
    ],
  },
  {
    key: "q4",
    title: "饮食方式／Food Preferences",
    opts: [
      { v: "A", text: "A. 我只吃白人饭，比起口味更在意食物的健康程度。" },
      { v: "B", text: "B. 我常吃白人饭，少有中餐。" },
      { v: "C", text: "C. 我偶尔吃白人饭，更加偏好中餐。" },
      { v: "D", text: "D. 我完全是中国胃，一顿不吃中餐浑身难受。" },
    ],
  },
  {
    key: "q5",
    title: "社会网络／Supporting networks",
    opts: [
      { v: "A", text: "A. 我在海外拥有强大社交圈和支持网络，从不感到孤独。" },
      { v: "B", text: "B. 我在海外有知心朋友，但偶尔会想念国内亲友。" },
      { v: "C", text: "C. 我在国内有更大社交圈，海外社交匮乏。" },
      { v: "D", text: "D. 我只有国内朋友，在海外也只跟中国人社交。" },
    ],
  },
];
// 分值映射
const qScore = { A: 4, B: 3, C: 2, D: 1 };

export default function WorthMove() {
  // 下拉选项
  const currencyOptions = Object.keys(pppRates);
  const periodOptions = ["月薪", "周薪", "年薪"];

  const [form, setForm] = useState({
    // 海外
    salary: "",
    currency: "人民币",
    period: "月薪",
    hasPR: false,
    hasChild: false,
    childAge: "",
    togetherO: false,
    under40: false,
    education: "海外本科",
    gradDateO: "",
    // 国内
    city: "杭州",
    district: null,
    dSalary: "",
    dCurrency: "人民币",
    dPeriod: "月薪",
    dHoliday: "",
    social: false,
    togetherD: false,
    future: false,
    // 问卷
    q1: "",
    q2: "",
    q3: "",
    q4: "",
    q5: "",
  });

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    // 互斥 “与家人在一起”
    if (name === "togetherO") {
      setForm((p) => ({
        ...p,
        togetherO: checked,
        togetherD: checked ? false : p.togetherD,
      }));
      return;
    }
    if (name === "togetherD") {
      setForm((p) => ({
        ...p,
        togetherD: checked,
        togetherO: checked ? false : p.togetherO,
      }));
      return;
    }
    if (name === "district") {
      setForm((p) => ({ ...p, district: value || null }));
      return;
    }
    setForm((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // 构建城市到区列表映射
  const cityDistrictMap = useMemo(() => {
    const map = {};
    subsidyData.forEach(({ city, district }) => {
      if (!map[city]) map[city] = new Set();
      if (district && district !== "全部") map[city].add(district);
    });
    return Object.fromEntries(
      Object.entries(map).map(([city, set]) => [
        city,
        Array.from(set),
      ])
    );
  }, []);
  const cityOptions = useMemo(() => Object.keys(cityDistrictMap), [cityDistrictMap]);
  const districtOptions = form.city
    ? ["", ...cityDistrictMap[form.city]]
    : [""];

  const toAnnual = (amt, p) => {
    const n = parseFloat(amt) || 0;
    if (p === "年薪") return n;
    if (p === "周薪") return n * 52;
    return n * 12;
  };
  const toMonthly = (amt, p) => toAnnual(amt, p) / 12;

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);

    // —— 维度1：薪资购买力 ——
    const annualGrossLocal = toAnnual(form.salary, form.period) * pppRates[form.currency];
    const overseasTax = calcOverseasTax(annualGrossLocal, form.currency);
    const ovGross = annualGrossLocal - overseasTax;
    const monthlyGrossLocal = toMonthly(form.dSalary, form.dPeriod) * pppRates[form.dCurrency];
    const sihf = form.social ? calcSIHF(form.city, monthlyGrossLocal) : 0;
    const taxableMonthly = monthlyGrossLocal - sihf;
    const annualTaxChina = calcChinaTax(taxableMonthly * 12);
    const dGross = taxableMonthly * 12 - annualTaxChina;
    // Adjust domestic income for actual working hours based on holiday type
    const standardHours = hoursMap["双休+朝九晚五"];
    const selectedHours = hoursMap[form.dHoliday] || standardHours;
    const dGrossAdjusted = dGross * (standardHours / selectedHours);
    // —— 年度人才补贴（如果适用），平均到每年 ——
    let subsidyAnnual = 0;
    if (form.under40) {
      const { total, monthTotal, yearTotal } = calcSubsidyTotal(
        form.city,
        form.district,
        form.education,
        form.gradDateO
      );
      subsidyAnnual = total / 5; // 平均到每年
    }
    const ovVal = ovGross;
    const dVal = dGrossAdjusted + subsidyAnnual; // 加上年度补贴再比较购买力
    const maxVal = Math.max(ovVal, dVal);
    const dim1O = ovVal === maxVal ? 20 : (ovVal / maxVal) * 20;
    const dim1D = dVal === maxVal ? 20 : (dVal / maxVal) * 20;

    // —— 维度2：与国外生活方式匹配程度 ——
    const qTotal = [form.q1, form.q2, form.q3, form.q4, form.q5].reduce(
      (s, k) => s + (k in qScore ? qScore[k] : 0),
      0
    );
    const dim2O = (qTotal / 20) * 20;
    const dim2D = 20 - dim2O;

    // —— 维度3：短期优势 (5年) —— 
    let ov5 = ovGross * 3 + ovGross * 1.3 * 2;
    let d5  = dGross * 3  + dGross  * 1.3 * 2;

    // 补贴（仅限40周岁以下）
    if (form.under40) {
      const { total: subsidyTotal } = calcSubsidyTotal(
        form.city,
        form.district,
        form.education,
        form.gradDateO
      );
      // 添加到 d5 上
      d5 += subsidyTotal;
    }

    // PR 加成（仅海外）
    if (form.hasPR) {
      ov5 *= 1.1;
    }

    // 家庭同城加成（海外或国内）
    if (form.togetherO) {
      ov5 *= 1.1;
    }
    if (form.togetherD) {
      d5  *= 1.1;
    }

    // 计算短期优势得分：5年总薪资越高得分越高
    const max5 = Math.max(ov5, d5);
    const dim3O = ov5 === max5 ? 20 : (ov5 / max5) * 20;
    const dim3D = d5  === max5 ? 20 : (d5  / max5) * 20;

    // —— 维度4：长期优势 (10年) ——
    let ov10 = ovGross * 3 + ovGross * 1.3 * 2 + ovGross * 1.5 * 5;
    let d10 = dGross * 3 + dGross * 1.3 * 2 + dGross * 1.5 * 5;
    if (form.future) ov10 *= 1.1;
    if (form.hasChild && parseInt(form.childAge, 10) < 18) ov10 *= 1.2;
    if (form.togetherO) ov10 *= 1.1;
    if (form.togetherD) d10 *= 1.1;
    const max10 = Math.max(ov10, d10);
    const dim4O = ov10 === max10 ? 20 : (ov10 / max10) * 20;
    const dim4D = d10 === max10 ? 20 : (d10 / max10) * 20;

    // —— 维度5：家人伴侣陪伴机会 ——
    const dim5O = form.togetherO ? 20 : 0;
    const dim5D = form.togetherD ? 20 : 0;

    // —— 汇总得分 & 构造图表数据 ——
    const scoreO = dim1O + dim2O + dim3O + dim4O + dim5O;
    const scoreD = dim1D + dim2D + dim3D + dim4D + dim5D;
    const labels = [
      "薪资购买力",
      "与海外生活\n方式契合度",
      "短期优势",
      "长期优势",
      "家人伴侣\n陪伴机会",
    ];
    const chartData = labels.map((t, i) => ({
      subject: t,
      Ov: [dim1O, dim2O, dim3O, dim4O, dim5O][i],
      Dom: [dim1D, dim2D, dim3D, dim4D, dim5D][i],
    }));

    setResults({ scoreO, scoreD, chart: chartData });
    setLoading(false);
    if (!isNaN(scoreO) && !isNaN(scoreD)) {
      setResults({ scoreO, scoreD, chart: chartData });
    } else {
      console.error("Error: Computed scores contain invalid values.");
      setResults(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-black via-blue-900 via-purple-900 to-green-500 text-white flex flex-col items-center py-8 px-4">
      <h1 className="text-3xl font-bold mb-4">WorthMove — 是否值得回国?</h1>
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-xl bg-white/10 backdrop-blur p-6 rounded-2xl space-y-6 text-white"
        >
          {/* 海外情况 */}
          <section className="space-y-4">
            <h2 className="font-semibold">海外情况</h2>
            <div className="grid grid-cols-3 gap-3">
              <input
                name="salary"
                type="number"
                placeholder="薪资"
                value={form.salary}
                onChange={handleChange}
                className="px-2 py-1 rounded bg-white/20 placeholder-white text-white"
              />
              <select
                name="currency"
                value={form.currency}
                onChange={handleChange}
                className="px-2 py-1 rounded bg-white/20 text-white"
              >
                {currencyOptions.map((c) => (
                  <option key={c} className="bg-white text-black">
                    {c}
                  </option>
                ))}
              </select>
              <select
                name="period"
                value={form.period}
                onChange={handleChange}
                className="px-2 py-1 rounded bg-white/20 text-white"
              >
                {periodOptions.map((p) => (
                  <option key={p} className="bg-white text-black">
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center">
              <input
                type="checkbox"
                name="hasPR"
                checked={form.hasPR}
                onChange={handleChange}
                className="mr-2"
              />
              已有海外PR
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                name="hasChild"
                checked={form.hasChild}
                onChange={handleChange}
                className="mr-2"
              />
              有小孩
            </label>
            {form.hasChild && (
              <input
                name="childAge"
                type="number"
                placeholder="孩子年龄"
                value={form.childAge}
                onChange={handleChange}
                className="w-full px-2 py-1 rounded bg-white/20 placeholder-white text-white"
              />
            )}
            <label className="flex items-center">
              <input
                type="checkbox"
                name="under40"
                checked={form.under40}
                onChange={handleChange}
                className="mr-2"
              />
              年龄40周岁以下
            </label>
            {form.under40 && (
              <>
                <label className="block font-medium">最高学历</label>
                <select
                  name="education"
                  value={form.education}
                  onChange={handleChange}
                  required
                  className="w-full px-2 py-1 rounded bg-white/20 text-white"
                >
                  {[
                    "海外博士",
                    "海外硕士",
                    "海外本科",
                    "国内博士",
                    "国内硕士",
                    "国内本科",
                  ].map((ed) => (
                    <option key={ed} className="bg-white text-black">
                      {ed}
                    </option>
                  ))}
                </select>

                <div className="flex items-center space-x-2 mt-2">
                  <label className="block font-medium">毕业时间：YYYY-MM</label>
                  <input
                    type="month"
                    name="gradDateO"
                    value={form.gradDateO}
                    onChange={handleChange}
                    required
                    className="px-2 py-1 rounded bg-white/20 text-white"
                  />
                </div>
              </>
            )}
            <label className="flex items-center">
              <input
                type="checkbox"
                name="togetherO"
                checked={form.togetherO}
                onChange={handleChange}
                className="mr-2"
              />
              与家人在一起
            </label>
          </section>

          {/* 国内情况 */}
          <section className="space-y-4 border-t border-white/20 pt-4">
            <h2 className="font-semibold">国内情况</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">城市</label>
                <select
                  name="city"
                  value={form.city || ""}
                  onChange={handleChange}
                  className="w-full px-2 py-1 bg-white/20 text-white rounded"
                >
                  <option value="">请选择城市</option>
                  {cityOptions.map((c) => (
                    <option key={c} value={c} className="bg-white text-black">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">区</label>
                <select
                  name="district"
                  value={form.district || ""}
                  onChange={handleChange}
                  className="w-full px-2 py-1 bg-white/20 text-white rounded"
                >
                  <option value="全部">全部区</option>
                  {districtOptions.slice(1).map((d) => (
                    <option key={d} value={d} className="bg-white text-black">
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input
                name="dSalary"
                type="number"
                placeholder="国内薪资"
                value={form.dSalary}
                onChange={handleChange}
                className="px-2 py-1 rounded bg-white/20 placeholder-white text-white"
              />
              <select
                name="dCurrency"
                value={form.dCurrency}
                onChange={handleChange}
                className="px-2 py-1 rounded bg-white/20 text-white"
              >
                {currencyOptions.map((c) => (
                  <option key={c} className="bg-white text-black">
                    {c}
                  </option>
                ))}
              </select>
              <select
                name="dPeriod"
                value={form.dPeriod}
                onChange={handleChange}
                className="px-2 py-1 rounded bg-white/20 text-white"
              >
                {periodOptions.map((p) => (
                  <option key={p} className="bg-white text-black">
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <label className="block font-medium">休假类型</label>
            <select
              name="dHoliday"
              value={form.dHoliday}
              onChange={handleChange}
              className="w-full px-2 py-1 rounded bg-white/20 text-white"
            >
              <option value="">请选择休假类型</option>
              {holidayOptions.map((h) => (
                <option key={h} className="bg-white text-black">
                  {h}
                </option>
              ))}
            </select>
            <label className="flex items-center">
              <input
                type="checkbox"
                name="social"
                checked={form.social}
                onChange={handleChange}
                className="mr-2"
              />
              五险一金
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                name="togetherD"
                checked={form.togetherD}
                onChange={handleChange}
                className="mr-2"
              />
              与家人在一起
            </label>
          </section>

          {/* 问卷 (必填) */}
          <section className="space-y-4 border-t border-white/20 pt-4">
            <h2 className="font-semibold">问卷 (必填)</h2>
            {questionnaire.map(({ key, title, opts }) => (
              <div key={key} className="space-y-2">
                <p className="font-medium">{title}</p>
                {opts.map(({ v, text }) => (
                  <label key={v} className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name={key}
                      value={v}
                      checked={form[key] === v}
                      onChange={handleChange}
                      required
                      className="mr-2"
                    />
                    <span className="text-sm">{text}</span>
                  </label>
                ))}
              </div>
            ))}
          </section>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 py-2 rounded text-white"
          >
            {loading ? "计算中…" : "计算对比"}
          </button>
        </form>

        {results && (
        <div className="w-full max-w-xl bg-white/20 backdrop-blur p-6 mt-6 rounded-lg text-white">
            <h2 className="text-xl font-semibold mb-2">结果</h2>
            <p className="mb-4">
              海外总分: {results.scoreO.toFixed(1)} | 国内总分: {results.scoreD.toFixed(1)}
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  data={results.chart}
                  outerRadius="80%"
                  margin={{ top: 10, right: 20, bottom: 10, left: 20 }}
                >
                  <PolarGrid stroke="#fff" />
                  <PolarAngleAxis
                    dataKey="subject"
                    stroke="#fff"
                    tick={<MultiLineTick fill="#fff" />}
                  />
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    formatter={(v) => <span style={{ color: "#fff" }}>{v}</span>}
                  />
                  <Radar
                    name="海外"
                    dataKey="Ov"
                    stroke="#32CD32"
                    fill="#32CD32"
                    fillOpacity={0.4}
                  />
                  <Radar
                    name="国内"
                    dataKey="Dom"
                    stroke="#1E90FF"
                    fill="#1E90FF"
                    fillOpacity={0.4}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 text-xs text-gray-300 space-y-1">
              <p>1. 薪资购买力是年薪减去当地个人所得税，再根据购买力平价转换因子（PPP conversion factor）进行的计算。</p>
              <p>2. 短期优势为5年内综合经济收益（国内已根据年龄、学历、地点进行了人才补贴等加和）。</p>
              <p>3. 长期优势为10年内综合经济收益、小孩情况等综合计算结果。</p>
              <p>4. 此计算仅提供一个决策思路，用户应该自己根据自身情况酌情调整对结果的解读。</p>
            </div>
          </div>
        )}
    </div>
  );
}