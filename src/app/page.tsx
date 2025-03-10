"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pie, Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  BarElement
} from 'chart.js';
// Add Monte Carlo imports
import MonteCarloChart from '@/components/ui/monte-carlo-chart';
import * as MonteCarloSim from '@/lib/monte-carlo';
import { Switch } from '@/components/ui/switch';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, PointElement, LineElement, Legend);

// Define server model type for better type safety
type ServerModel = {
  inferenceTPS: number;
  concurrentRequests: number;
  gpusPerServer: number;
  totalTPS: number;
  baseRentalRate: number;
  inferenceRate: number;
  rwaiCost: number;
  fractionalPrice: number;
  colocationCost: number;
  otherExpenses: number;
  baseLeaseYear: number;
  monthlyLeasePerToken: number;
};

type ServerModels = {
  [key: string]: ServerModel;
};

// Define scenario result type
type ScenarioResult = {
  rwaiROI: number;
  irr: number;
  roi: number;
  noi: number;
  salvageValue: number;
  pricePerToken: number;
  progressiveShare: number;
};

// Declare React component props types for JSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      div: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;
      p: React.DetailedHTMLProps<React.HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>;
      h1: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
      label: React.DetailedHTMLProps<React.LabelHTMLAttributes<HTMLLabelElement>, HTMLLabelElement>;
      input: React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>;
      button: React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>;
      select: React.DetailedHTMLProps<React.SelectHTMLAttributes<HTMLSelectElement>, HTMLSelectElement>;
      option: React.DetailedHTMLProps<React.OptionHTMLAttributes<HTMLOptionElement>, HTMLOptionElement>;
      table: React.DetailedHTMLProps<React.TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>;
      thead: React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>;
      tbody: React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableSectionElement>, HTMLTableSectionElement>;
      tr: React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>;
      th: React.DetailedHTMLProps<React.ThHTMLAttributes<HTMLTableHeaderCellElement>, HTMLTableHeaderCellElement>;
      td: React.DetailedHTMLProps<React.TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>;
      strong: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      h3: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
      main: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

// Complete server model data:
const serverModels: ServerModels = {
  RTX5090: {
    inferenceTPS: 200,
    concurrentRequests: 4,
    gpusPerServer: 6,
    totalTPS: 200 * 4 * 6, // 4800
    baseRentalRate: 0.4,
    inferenceRate: 0.3,
    rwaiCost: 32500,
    fractionalPrice: 60000,
    colocationCost: 6000,
    otherExpenses: 1400,
    baseLeaseYear: 16800,
    monthlyLeasePerToken: 1.90
  },
  H100: {
    inferenceTPS: 600,
    concurrentRequests: 16,
    gpusPerServer: 8,
    totalTPS: 600 * 16 * 8, // 76800
    baseRentalRate: 1.6,
    inferenceRate: 0.3,
    rwaiCost: 225000,
    fractionalPrice: 400000,
    colocationCost: 18000,
    otherExpenses: 3600,
    baseLeaseYear: 152000,
    monthlyLeasePerToken: 12.667
  },
  H200: {
    inferenceTPS: 1200,
    concurrentRequests: 24,
    gpusPerServer: 8,
    totalTPS: 1200 * 24 * 8, // 230400
    baseRentalRate: 2.25,
    inferenceRate: 0.3,
    rwaiCost: 275000,
    fractionalPrice: 500000,
    colocationCost: 19200,
    otherExpenses: 4200,
    baseLeaseYear: 190000,
    monthlyLeasePerToken: 15.833
  },
  GB72: {
    inferenceTPS: 6000,
    concurrentRequests: 36,
    gpusPerServer: 10,
    totalTPS: 6000 * 36 * 10, // 2160000
    baseRentalRate: 4.25,
    inferenceRate: 0.3,
    rwaiCost: 500000,
    fractionalPrice: 825000,
    colocationCost: 24000,
    otherExpenses: 6000,
    baseLeaseYear: 313500,
    monthlyLeasePerToken: 26.125
  }
};

// IRR helper: calculates IRR using Newton's method
const calculateIRR = (cashFlows: number[], guess = 0.1): number => {
  const maxIterations = 100;
  const tolerance = 0.000001;
  let rate = guess;
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      npv += cashFlows[t] / Math.pow(1 + rate, t / 12);
      dnpv -= (t / 12) * cashFlows[t] / Math.pow(1 + rate, t / 12 + 1);
    }
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < tolerance) return newRate;
    rate = newRate;
  }
  return rate;
};

// Calculate NPV (Net Present Value) with given discount rate
const calculateNPV = (cashFlows: number[], discountRate: number): number => {
  return cashFlows.reduce((npv, cashFlow, t) => {
    return npv + cashFlow / Math.pow(1 + discountRate, t/12);
  }, 0);
};

// Enhanced NPV function with variable discount rates
const calculateEnhancedNPV = (cashFlows: number[], discountRates: number[]): number => {
  return cashFlows.reduce((npv, cashFlow, t) => {
    // Use the discount rate for the current period or the last provided rate
    const periodRate = t < discountRates.length ? discountRates[t] : discountRates[discountRates.length - 1];
    return npv + cashFlow / Math.pow(1 + periodRate, t/12);
  }, 0);
};

// Calculate Modified Internal Rate of Return (MIRR)
const calculateMIRR = (
  cashFlows: number[], 
  financeRate: number, 
  reinvestRate: number
): number => {
  const negativeCashFlows = cashFlows.map(cf => cf < 0 ? -cf : 0);
  const positiveCashFlows = cashFlows.map(cf => cf > 0 ? cf : 0);
  
  // Present value of negative cash flows at finance rate
  const pvNegative = negativeCashFlows.reduce((pv, cf, t) => {
    return pv + cf / Math.pow(1 + financeRate, t/12);
  }, 0);
  
  // Future value of positive cash flows at reinvestment rate
  const fvPositive = positiveCashFlows.reduce((fv, cf, t) => {
    const periodsToEnd = cashFlows.length - 1 - t;
    return fv + cf * Math.pow(1 + reinvestRate, periodsToEnd/12);
  }, 0);
  
  // Calculate MIRR
  const n = (cashFlows.length - 1) / 12; // Convert months to years
  return Math.pow(fvPositive / pvNegative, 1/n) - 1;
};

// Calculate Weighted Average Cost of Capital (WACC)
const calculateWACC = (
  equityPercentage: number, 
  costOfEquity: number, 
  debtPercentage: number, 
  costOfDebt: number, 
  taxRate: number
): number => {
  return (equityPercentage * costOfEquity) + (debtPercentage * costOfDebt * (1 - taxRate));
};

// Calculate Discounted Payback Period
const calculateDiscountedPaybackPeriod = (
  cashFlows: number[], 
  discountRate: number
): number => {
  const discountedCashFlows = cashFlows.map((cf, t) => cf / Math.pow(1 + discountRate, t/12));
  
  let cumulativeDiscountedCashFlow = 0;
  for (let t = 0; t < discountedCashFlows.length; t++) {
    cumulativeDiscountedCashFlow += discountedCashFlows[t];
    if (cumulativeDiscountedCashFlow >= 0) {
      if (t === 0) return 0;
      
      // Linear interpolation for fractional period
      const previousCF = cumulativeDiscountedCashFlow - discountedCashFlows[t];
      const fraction = -previousCF / discountedCashFlows[t];
      return t - 1 + fraction;
    }
  }
  return -1; // Payback not achieved
};

const calculateMOIC = (totalReturn: number, initialInvestment: number): number => {
  return totalReturn / initialInvestment;
};

const calculatePaybackPeriod = (cumulativeCashFlow: number[]): number => {
  const firstPositiveIndex = cumulativeCashFlow.findIndex(val => val >= 0);
  if (firstPositiveIndex <= 0) return -1; // Not reached or immediate payback
  
  // Linear interpolation for fractional period
  const previousCF = cumulativeCashFlow[firstPositiveIndex - 1];
  const currentCF = cumulativeCashFlow[firstPositiveIndex];
  const fraction = -previousCF / (currentCF - previousCF);
  
  return firstPositiveIndex - 1 + fraction;
};

// Helper type for model keys
type ModelKey = keyof typeof serverModels;

const FinancialDashboard = () => {
  // User inputs:
  const [selectedModel, setSelectedModel] = useState<ModelKey>("RTX5090");
  const [utilizationRate, setUtilizationRate] = useState<number>(60);   // in %
  const [splitRatio, setSplitRatio] = useState<number>(50);            // inference % (0-100)
  const [tokensPerBox, setTokensPerBox] = useState<number>(1000);
  const [fractionalPrice, setFractionalPrice] = useState<number>(serverModels["RTX5090"].fractionalPrice);
  const [targetYield, setTargetYield] = useState<number>(18);           // annual yield in %
  const [salvageRate, setSalvageRate] = useState<number>(20);           // salvage rate in %
  const [progressiveNOI, setProgressiveNOI] = useState<boolean>(true);  // toggle for progressive NOI sharing
  const [discountRate, setDiscountRate] = useState<number>(12); // annual discount rate (%)
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState<boolean>(false);
  const [selectedSensitivityVariable, setSelectedSensitivityVariable] = useState<string>("utilizationRate");
  
  // New state for advanced DCF analysis
  const [useVariableDiscountRate, setUseVariableDiscountRate] = useState<boolean>(false);
  const [yearlyDiscountRates, setYearlyDiscountRates] = useState<number[]>([12, 12, 12, 12, 12]); // One rate per year
  const [useWACC, setUseWACC] = useState<boolean>(false);
  const [equityPercentage, setEquityPercentage] = useState<number>(70);
  const [costOfEquity, setCostOfEquity] = useState<number>(15);
  const [debtPercentage, setDebtPercentage] = useState<number>(30);
  const [costOfDebt, setCostOfDebt] = useState<number>(8);
  const [taxRate, setTaxRate] = useState<number>(21);
  const [financeRate, setFinanceRate] = useState<number>(6);
  const [reinvestRate, setReinvestRate] = useState<number>(4);
  
  // State for enhanced metrics results
  const [enhancedNPV, setEnhancedNPV] = useState<number>(0);
  const [mirrValue, setMirrValue] = useState<number>(0);
  const [waccValue, setWaccValue] = useState<number>(0);
  const [discountedPaybackPeriod, setDiscountedPaybackPeriod] = useState<number>(0);
  
  // Risk Assessment / Monte Carlo state
  const [showRiskAssessment, setShowRiskAssessment] = useState<boolean>(false);
  const [simulationMetric, setSimulationMetric] = useState<string>("IRR");
  const [utilizationStdDev, setUtilizationStdDev] = useState<number>(10);
  const [salvageStdDev, setSalvageStdDev] = useState<number>(5);
  const [monteCarloSimulations, setMonteCarloSimulations] = useState<number>(1000);
  const [simulationResults, setSimulationResults] = useState<MonteCarloSim.SimulationResult | null>(null);
  const [enableTokenPriceFluctuations, setEnableTokenPriceFluctuations] = useState<boolean>(false);
  const [tokenPriceVolatility, setTokenPriceVolatility] = useState<number>(30);
  const [tokenPriceDrift, setTokenPriceDrift] = useState<number>(5);
  
  // Scenario Analysis state
  const [showScenarios, setShowScenarios] = useState<boolean>(false);
  const [scenarioType, setScenarioType] = useState<string>("utilization");
  
  // Scenario variations
  const utilizationScenarios = [40, 60, 80];
  const salvageScenarios = [10, 20, 30];
  const tokenPriceScenarios = [0.8, 1.0, 1.2]; // multipliers of current fractional price
  
  // Total server monthly lease (independent slider)
  const [serverMonthlyLease, setServerMonthlyLease] = useState<number>(serverModels["RTX5090"].baseLeaseYear / 12);

  // Derived values:
  const model = serverModels[selectedModel];
  const pricePerToken = fractionalPrice / tokensPerBox;
  const salvageValuePerToken = (salvageRate / 100) * model.rwaiCost / tokensPerBox;
  // Per-token monthly lease is simply total lease divided by tokens.
  const perTokenMonthlyLease = serverMonthlyLease / tokensPerBox;

  // Calculate Annual Yield based on the ORIGINAL formula
  const calcYieldFromLease = (monthlyLease: number, price: number): number => {
    // Total cash inflow over 5 years (60 months) plus salvage
    const totalInflow = (monthlyLease * 60) + salvageValuePerToken;
    // Net gain = inflow - initial investment
    const netGain = totalInflow - price;
    // Annual yield = net gain / initial investment / 5 years * 100%
    return (netGain / price) / 5 * 100;
  };

  // Compute cumulative token cash flow (per token) over 60 months
  const cumulativeCashFlow: number[] = [];
  let cumSum = -pricePerToken;
  cumulativeCashFlow.push(cumSum);
  for (let i = 1; i <= 60; i++) {
    cumSum += perTokenMonthlyLease;
    if (i === 60) {
      cumSum += salvageValuePerToken;
    }
    cumulativeCashFlow.push(cumSum);
  }

  // Calculate yield based on the formula:
  // Yield (%) = (((perTokenMonthlyLease * 60) - pricePerToken) / pricePerToken) / 5 * 100
  useEffect(() => {
    const newYield = calcYieldFromLease(perTokenMonthlyLease, pricePerToken);
    setTargetYield(newYield);
  }, [serverMonthlyLease, pricePerToken, tokensPerBox, salvageRate]);

  // Calculate IRR (per-token cash flows)
  const cashFlows: number[] = [-pricePerToken];
  for (let i = 0; i < 60; i++) {
    cashFlows.push(perTokenMonthlyLease);
  }
  cashFlows[cashFlows.length - 1] += salvageValuePerToken;
  const irrVal = calculateIRR(cashFlows, 0.1) * 100;

  // Simple ROI and CAGR calculations over 5 years
  const totalReturn = (perTokenMonthlyLease * 60) + salvageValuePerToken;
  const netGain = totalReturn - pricePerToken;
  const simpleROI = (netGain / pricePerToken) * 100;
  const cagr = (Math.pow(1 + (simpleROI / 100), 1 / 5) - 1) * 100;

  // RWAi.ai Revenue Calculations (server-level)
  const hoursPerYear = 8760;
  const utilizationHours = (utilizationRate / 100) * hoursPerYear;
  const inferenceHours = (splitRatio / 100) * utilizationHours;
  const rentalHours = utilizationHours - inferenceHours;
  const inferenceRevenue = inferenceHours * model.totalTPS * (model.inferenceRate / 1_000_000) * 3600;
  const rentalRevenue = rentalHours * model.baseRentalRate * model.gpusPerServer;
  const totalRevenue = inferenceRevenue + rentalRevenue + (fractionalPrice / 5);

  // Operating Expenses for the server:
  const annualLeasePayments = serverMonthlyLease * 12;
  const totalExpenses = model.colocationCost + model.otherExpenses + annualLeasePayments + (model.rwaiCost / 5);
  const noi = totalRevenue - totalExpenses;
  const rwaiROI = (noi / totalExpenses) * 100;

  // Progressive NOI Sharing model
  
  // Progressive sharing tiers based on performance (measured by rwaiROI)
  const calculateProgressiveSharePercentage = (roi: number) => {
    // Base share is minimum 10% of NOI
    let sharePercentage = 0.10;
    
    // Tier 1: ROI between 10% and 20%
    if (roi >= 10) sharePercentage = 0.15;
    
    // Tier 2: ROI between 20% and 30%
    if (roi >= 20) sharePercentage = 0.20;
    
    // Tier 3: ROI between 30% and 40%
    if (roi >= 30) sharePercentage = 0.25;
    
    // Tier 4: ROI between 40% and 50%
    if (roi >= 40) sharePercentage = 0.30;
    
    // Tier 5: ROI above 50%
    if (roi >= 50) sharePercentage = 0.35;
    
    return sharePercentage;
  };
  
  const sharePercentage = calculateProgressiveSharePercentage(rwaiROI);
  
  // Calculate the NOI sharing bonus (only applies when NOI is positive)
  const shareOfNOI = noi > 0 ? noi * sharePercentage : 0;
  const noiBonus = progressiveNOI ? shareOfNOI : 0;
  
  // Token holders always get the guaranteed lease payment
  // When progressive sharing is enabled and NOI is positive, they get an ADDITIONAL bonus
  const progressiveAnnualPayment = annualLeasePayments + noiBonus;
  const progressiveMonthlyPayment = progressiveAnnualPayment / 12;
  const progressivePerTokenMonthlyLease = progressiveMonthlyPayment / tokensPerBox;
  
  // Use progressive or standard lease payment based on toggle
  const effectivePerTokenMonthlyLease = progressiveNOI
    ? progressivePerTokenMonthlyLease
    : perTokenMonthlyLease;
    
  // Calculate the progressive bonus (the additional amount above the guaranteed lease)
  const progressiveBonus = progressiveNOI && noi > 0 
    ? progressivePerTokenMonthlyLease - perTokenMonthlyLease
    : 0;
    
  // When displaying in the UI, show a detailed explanation
  const progressiveExplanation = () => {
    if (!progressiveNOI) return "Disabled";
    if (noi <= 0) return "Waiting for positive NOI (token holders receive guaranteed lease payment only)";
    
    return `Adding a bonus of $${progressiveBonus.toFixed(2)}/token monthly on top of the guaranteed lease payment by sharing ${(sharePercentage * 100).toFixed(1)}% of NOI`;
  };
  
  // Calculate Annual Yield based on the effective lease payment using the original formula
  const effectiveAnnualYield = calcYieldFromLease(effectivePerTokenMonthlyLease, pricePerToken);
  
  // Recalculate cash flows with progressive sharing if enabled
  const progressiveCashFlows: number[] = [-pricePerToken];
  for (let i = 0; i < 60; i++) {
    progressiveCashFlows.push(effectivePerTokenMonthlyLease);
  }
  progressiveCashFlows[progressiveCashFlows.length - 1] += salvageValuePerToken;
  
  // Recalculate financial metrics with progressive sharing
  const progressiveIRR = calculateIRR(progressiveCashFlows, 0.1) * 100;
  const progressiveTotalReturn = (effectivePerTokenMonthlyLease * 60) + salvageValuePerToken;
  const progressiveNetGain = progressiveTotalReturn - pricePerToken;
  const progressiveROI = (progressiveNetGain / pricePerToken) * 100;
  
  // Use the progressive or standard metrics based on the toggle
  const effectiveIRR = progressiveNOI ? progressiveIRR : irrVal;
  const effectiveROI = progressiveNOI ? progressiveROI : simpleROI;
  
  // Progressive cumulative cash flow
  const progressiveCumulativeCashFlow: number[] = [];
  let progressiveCumSum = -pricePerToken;
  progressiveCumulativeCashFlow.push(progressiveCumSum);
  for (let i = 1; i <= 60; i++) {
    progressiveCumSum += effectivePerTokenMonthlyLease;
    if (i === 60) {
      progressiveCumSum += salvageValuePerToken;
    }
    progressiveCumulativeCashFlow.push(progressiveCumSum);
  }
   
  // Calculate breakeven
  const effectiveCumulativeCashFlow = progressiveNOI ? progressiveCumulativeCashFlow : cumulativeCashFlow;

  // Calculate breakeven month
  const breakevenMonth = effectiveCumulativeCashFlow.findIndex((val) => val >= 0);
  
  // Display the progressive sharing info in the UI
  // Progressive sharing is active when enabled and NOI is positive
  const isProgressiveActive = progressiveNOI && noi > 0;
  
  // Calculate NPV with user-defined discount rate
  const npv = calculateNPV(progressiveNOI ? progressiveCashFlows : cashFlows, discountRate / 100);
  
  // Multiple on Invested Capital (MOIC)
  const moic = calculateMOIC(progressiveNOI ? progressiveTotalReturn : totalReturn, pricePerToken);
  
  // Payback period in months
  const paybackPeriod = calculatePaybackPeriod(effectiveCumulativeCashFlow);
  
  // Profitability Index (PI)
  const profitabilityIndex = npv / pricePerToken;
  
  // Sensitivity analysis
  const generateSensitivityData = () => {
    const variations: any[] = [];
    
    // Don't try to use tokenPrices at all in this function
    // Just use salvage value in all cases
    
    if (selectedSensitivityVariable === "utilizationRate") {
      // Generate 5 utilization rate variations from 20% to 100%
      for (let rate = 20; rate <= 100; rate += 20) {
        // Create a scenario with this utilization rate
        const scenarioUtilizationHours = (rate / 100) * hoursPerYear;
        const scenarioInferenceHours = (splitRatio / 100) * scenarioUtilizationHours;
        const scenarioRentalHours = scenarioUtilizationHours - scenarioInferenceHours;
        
        const scenarioInferenceRevenue = scenarioInferenceHours * model.totalTPS * (model.inferenceRate / 1_000_000) * 3600;
        const scenarioRentalRevenue = scenarioRentalHours * model.baseRentalRate * model.gpusPerServer;
        const scenarioTotalRevenue = scenarioInferenceRevenue + scenarioRentalRevenue + (fractionalPrice / 5);
        
        const scenarioNOI = scenarioTotalRevenue - totalExpenses;
        const scenarioROI = (scenarioNOI / totalExpenses) * 100;
        
        // Calculate progressive sharing for this scenario
        const scenarioSharePercentage = calculateProgressiveSharePercentage(scenarioROI);
        
        // Calculate the NOI sharing bonus (only applies when NOI is positive)
        const scenarioShareOfNOI = scenarioNOI > 0 ? scenarioNOI * scenarioSharePercentage : 0;
        const scenarioNOIBonus = progressiveNOI ? scenarioShareOfNOI : 0;
        
        // Token holders always get the guaranteed lease payment
        // When progressive sharing is enabled and NOI is positive, they get an ADDITIONAL bonus
        const scenarioProgressiveAnnualPayment = annualLeasePayments + scenarioNOIBonus;
        const scenarioProgressiveMonthlyPayment = scenarioProgressiveAnnualPayment / 12;
        const scenarioProgressivePerTokenMonthlyLease = scenarioProgressiveMonthlyPayment / tokensPerBox;
        
        // Use progressive or standard lease payment based on toggle
        const scenarioEffectivePerTokenMonthlyLease = progressiveNOI 
          ? scenarioProgressivePerTokenMonthlyLease 
          : perTokenMonthlyLease;
        
        // Ensure monthly lease is never negative (though it shouldn't be with additive logic)
        const scenarioFinalPerTokenMonthlyLease = Math.max(0, scenarioEffectivePerTokenMonthlyLease);
        
        // Calculate IRR for this scenario
        const scenarioCashFlows: number[] = [-pricePerToken];
        for (let i = 0; i < 60; i++) {
          scenarioCashFlows.push(scenarioFinalPerTokenMonthlyLease);
        }
        
        // If token price fluctuations are enabled, we still just use salvage value
        // since tokenPrices won't be available until the simulation runs
        scenarioCashFlows[scenarioCashFlows.length - 1] += salvageValuePerToken;
        
        const scenarioIRR = calculateIRR(scenarioCashFlows, 0.1) * 100;
        
        // Always use salvage value in this function
        const finalValue = salvageValuePerToken;
        
        const scenarioTotalReturn = (scenarioEffectivePerTokenMonthlyLease * 60) + finalValue;
        const scenarioNetGain = scenarioTotalReturn - pricePerToken;
        const scenarioROIPercent = (scenarioNetGain / pricePerToken) * 100;
        
        variations.push({
          value: rate,
          irr: scenarioIRR,
          npv: scenarioNOI,
          monthlyLease: scenarioFinalPerTokenMonthlyLease,
          roi: scenarioROIPercent
        });
      }
    } else if (selectedSensitivityVariable === "splitRatio") {
      // Generate 5 split ratio variations from 0% to 100%
      for (let ratio = 0; ratio <= 100; ratio += 25) {
        const scenarioInferenceHours = (ratio / 100) * utilizationHours;
        const scenarioRentalHours = utilizationHours - scenarioInferenceHours;
        
        const scenarioInferenceRevenue = scenarioInferenceHours * model.totalTPS * (model.inferenceRate / 1_000_000) * 3600;
        const scenarioRentalRevenue = scenarioRentalHours * model.baseRentalRate * model.gpusPerServer;
        const scenarioTotalRevenue = scenarioInferenceRevenue + scenarioRentalRevenue + (fractionalPrice / 5);
        
        const scenarioNOI = scenarioTotalRevenue - totalExpenses;
        const scenarioROI = (scenarioNOI / totalExpenses) * 100;
        
        // Calculate progressive sharing for this scenario
        const scenarioSharePercentage = calculateProgressiveSharePercentage(scenarioROI);
        
        // Calculate the NOI sharing bonus (only applies when NOI is positive)
        const scenarioShareOfNOI = scenarioNOI > 0 ? scenarioNOI * scenarioSharePercentage : 0;
        const scenarioNOIBonus = progressiveNOI ? scenarioShareOfNOI : 0;
        
        // Token holders always get the guaranteed lease payment
        // When progressive sharing is enabled and NOI is positive, they get an ADDITIONAL bonus
        const scenarioProgressiveAnnualPayment = annualLeasePayments + scenarioNOIBonus;
        const scenarioProgressiveMonthlyPayment = scenarioProgressiveAnnualPayment / 12;
        const scenarioProgressivePerTokenMonthlyLease = scenarioProgressiveMonthlyPayment / tokensPerBox;
        
        // Use progressive or standard lease payment based on toggle
        const scenarioEffectivePerTokenMonthlyLease = progressiveNOI 
          ? scenarioProgressivePerTokenMonthlyLease 
          : perTokenMonthlyLease;
        
        // Ensure monthly lease is never negative (though it shouldn't be with additive logic)
        const scenarioFinalPerTokenMonthlyLease = Math.max(0, scenarioEffectivePerTokenMonthlyLease);
        
        // IRR and NPV
        const scenarioCashFlows = [-pricePerToken];
        for (let i = 0; i < 60; i++) {
          scenarioCashFlows.push(scenarioFinalPerTokenMonthlyLease);
        }
        
        // Always use salvage value
        scenarioCashFlows[scenarioCashFlows.length - 1] += salvageValuePerToken;
        
        const scenarioIRR = calculateIRR(scenarioCashFlows, 0.1) * 100;
        const scenarioNPV = calculateNPV(scenarioCashFlows, discountRate / 100);
        
        variations.push({
          value: ratio,
          irr: scenarioIRR,
          npv: scenarioNPV,
          monthlyLease: scenarioFinalPerTokenMonthlyLease,
          roi: scenarioROI
        });
      }
    } else if (selectedSensitivityVariable === "inferencePrice") {
      // Generate variations for inference price from 0.05 to 0.50 per million tokens
      const inferencePrices = [0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50];
      
      for (const inferencePrice of inferencePrices) {
        // Create a scenario with this inference price
        const scenarioInferenceRevenue = inferenceHours * model.totalTPS * (inferencePrice / 1_000_000) * 3600;
        const scenarioTotalRevenue = scenarioInferenceRevenue + rentalRevenue + (fractionalPrice / 5);
        
        const scenarioNOI = scenarioTotalRevenue - totalExpenses;
        const scenarioROI = (scenarioNOI / totalExpenses) * 100;
        
        // Calculate progressive sharing for this scenario
        const scenarioSharePercentage = calculateProgressiveSharePercentage(scenarioROI);
        
        // Calculate the NOI sharing bonus (only applies when NOI is positive)
        const scenarioShareOfNOI = scenarioNOI > 0 ? scenarioNOI * scenarioSharePercentage : 0;
        const scenarioNOIBonus = progressiveNOI ? scenarioShareOfNOI : 0;
        
        // Token holders always get the guaranteed lease payment
        // When progressive sharing is enabled and NOI is positive, they get an ADDITIONAL bonus
        const scenarioProgressiveAnnualPayment = annualLeasePayments + scenarioNOIBonus;
        const scenarioProgressiveMonthlyPayment = scenarioProgressiveAnnualPayment / 12;
        const scenarioProgressivePerTokenMonthlyLease = scenarioProgressiveMonthlyPayment / tokensPerBox;
        
        // Use progressive or standard lease payment based on toggle
        const scenarioEffectivePerTokenMonthlyLease = progressiveNOI 
          ? scenarioProgressivePerTokenMonthlyLease 
          : perTokenMonthlyLease;
        
        // Ensure monthly lease is never negative
        const scenarioFinalPerTokenMonthlyLease = Math.max(0, scenarioEffectivePerTokenMonthlyLease);
        
        // Calculate IRR for this scenario
        const scenarioCashFlows = [-pricePerToken];
        for (let i = 0; i < 60; i++) {
          scenarioCashFlows.push(scenarioFinalPerTokenMonthlyLease);
        }
        
        // Always use salvage value 
        scenarioCashFlows[scenarioCashFlows.length - 1] += salvageValuePerToken;
        
        const scenarioIRR = calculateIRR(scenarioCashFlows, 0.1) * 100;
        const scenarioNPV = calculateNPV(scenarioCashFlows, discountRate / 100);
        
        variations.push({
          value: inferencePrice,
          irr: scenarioIRR,
          npv: scenarioNPV,
          monthlyLease: scenarioFinalPerTokenMonthlyLease,
          roi: scenarioROI
        });
      }
    } else if (selectedSensitivityVariable === "discountRate") {
      // Generate 5 discount rate variations from 5% to 25%
      for (let rate = 5; rate <= 25; rate += 5) {
        const scenarioNPV = calculateNPV(effectiveCumulativeCashFlow, rate / 100);
        
        variations.push({
          value: rate,
          irr: irrVal, // IRR doesn't change with discount rate
          npv: scenarioNPV,
          monthlyLease: effectivePerTokenMonthlyLease,
          roi: simpleROI // Use company ROI, not token holder ROI
        });
      }
    }
    
    return variations;
  };
  
  // Generate sensitivity data
  const sensitivityData = generateSensitivityData();
  
  // Monte Carlo simulation function
  const runMonteCarloSimulation = () => {
    // Define a function that calculates the selected metric based on simulation parameters
    const calculateMetricForSimulation = (simUtilization: number, simSalvageRate: number, tokenPrices?: number[]): number => {
      // Create a scenario with this utilization rate
      const scenarioUtilizationHours = (simUtilization / 100) * hoursPerYear;
      const scenarioInferenceHours = (splitRatio / 100) * scenarioUtilizationHours;
      const scenarioRentalHours = scenarioUtilizationHours - scenarioInferenceHours;
      
      const scenarioInferenceRevenue = scenarioInferenceHours * model.totalTPS * (model.inferenceRate / 1_000_000) * 3600;
      const scenarioRentalRevenue = scenarioRentalHours * model.baseRentalRate * model.gpusPerServer;
      const scenarioTotalRevenue = scenarioInferenceRevenue + scenarioRentalRevenue + (fractionalPrice / 5);
      
      const scenarioNOI = scenarioTotalRevenue - totalExpenses;
      const scenarioROI = (scenarioNOI / totalExpenses) * 100;
      
      // Calculate salvage value based on the simulated salvage rate
      const scenarioSalvageValuePerToken = (simSalvageRate / 100) * model.rwaiCost / tokensPerBox;
      
      // Calculate progressive sharing for this scenario
      const scenarioSharePercentage = calculateProgressiveSharePercentage(scenarioROI);
      
      // Calculate the NOI sharing bonus (only applies when NOI is positive)
      const scenarioShareOfNOI = scenarioNOI > 0 ? scenarioNOI * scenarioSharePercentage : 0;
      const scenarioNOIBonus = progressiveNOI ? scenarioShareOfNOI : 0;
      
      // Token holders always get the guaranteed lease payment
      // When progressive sharing is enabled and NOI is positive, they get an ADDITIONAL bonus
      const scenarioProgressiveAnnualPayment = annualLeasePayments + scenarioNOIBonus;
      const scenarioProgressiveMonthlyPayment = scenarioProgressiveAnnualPayment / 12;
      const scenarioProgressivePerTokenMonthlyLease = scenarioProgressiveMonthlyPayment / tokensPerBox;
      
      // Use progressive or standard lease payment based on toggle
      const scenarioEffectivePerTokenMonthlyLease = progressiveNOI 
        ? scenarioProgressivePerTokenMonthlyLease 
        : perTokenMonthlyLease;
      
      // Calculate IRR for this scenario
      const scenarioCashFlows = [-pricePerToken];
      for (let i = 0; i < 60; i++) {
        scenarioCashFlows.push(scenarioEffectivePerTokenMonthlyLease);
      }
      
      // If token price fluctuations are enabled and we have token prices, use the final token price
      // as the exit value instead of the salvage value
      if (tokenPrices &&enableTokenPriceFluctuations) {
        // The last token price becomes the exit value, replacing the salvage value
        scenarioCashFlows[scenarioCashFlows.length - 1] = scenarioEffectivePerTokenMonthlyLease + tokenPrices[tokenPrices.length - 1];
      } else {
        // Otherwise add the salvage value to the final payment
        scenarioCashFlows[scenarioCashFlows.length - 1] += scenarioSalvageValuePerToken;
      }
      
      const scenarioIRR = calculateIRR(scenarioCashFlows, 0.1) * 100;
      
      // Calculate ROI with progressive sharing
      const finalValue = tokenPrices && enableTokenPriceFluctuations 
        ? tokenPrices[tokenPrices.length - 1] // Use final token price if fluctuations enabled
        : scenarioSalvageValuePerToken; // Otherwise use salvage value
        
      const scenarioTotalReturn = (scenarioEffectivePerTokenMonthlyLease * 60) + finalValue;
      const scenarioNetGain = scenarioTotalReturn - pricePerToken;
      const scenarioROIPercent = (scenarioNetGain / pricePerToken) * 100;
      
      // Return the requested metric
      switch (simulationMetric) {
        case "IRR":
          return scenarioIRR;
        case "ROI":
          return scenarioROIPercent;
        case "MonthlyLease":
          return scenarioEffectivePerTokenMonthlyLease;
        case "NOI":
          return scenarioNOI;
        default:
          return scenarioIRR;
      }
    };
    
    // Run the Monte Carlo simulation with the current parameters
    let results;
    if (enableTokenPriceFluctuations) {
      results = MonteCarloSim.simulateTokenHolderReturnsWithPriceFluctuations(
        {
          pricePerToken,
          monthlyLeasePerToken: effectivePerTokenMonthlyLease,
          salvageValuePerToken,
          months: 60,
          utilizationMean: utilizationRate,
          utilizationStd: utilizationStdDev,
          salvageValueMean: salvageRate,
          salvageValueStd: salvageStdDev,
          tokenPriceVolatility,
          tokenPriceDrift,
          calculateReturnFn: calculateMetricForSimulation
        },
        monteCarloSimulations
      );
    } else {
      results = MonteCarloSim.simulateTokenHolderReturns(
        {
          pricePerToken,
          monthlyLeasePerToken: effectivePerTokenMonthlyLease,
          salvageValuePerToken,
          months: 60,
          utilizationMean: utilizationRate,
          utilizationStd: utilizationStdDev,
          salvageValueMean: salvageRate,
          salvageValueStd: salvageStdDev,
          progressiveNOI,
          calculateReturnFn: calculateMetricForSimulation
        },
        monteCarloSimulations
      );
    }
    
    // Update the state with the simulation results
    setSimulationResults(results);
  };
  
  // Prepare data for the sensitivity chart
  const sensitivityChartData = {
    labels: sensitivityData.map(d => d.value.toString() + (selectedSensitivityVariable === "utilizationRate" || selectedSensitivityVariable === "splitRatio" ? "%" : "")),
    datasets: [
      {
        label: "IRR (%)",
        data: sensitivityData.map(d => d.irr),
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.1)",
        pointBackgroundColor: "#3b82f6",
        yAxisID: 'y',
      },
      {
        label: "NPV ($)",
        data: sensitivityData.map(d => d.npv),
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.1)",
        pointBackgroundColor: "#10b981",
        yAxisID: 'y1',
      }
    ],
  };
  
  // Options for sensitivity chart
  const sensitivityChartOptions = {
    maintainAspectRatio: false,
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'IRR (%)',
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'NPV ($)',
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  // Scenario analysis calculations
  const calculateScenarioResults = (scenarioValue: number, scenarioType: string, tokenPrices?: number[]) => {
    // Check if tokenPrices parameter is provided and not empty (once at the beginning)
    const hasTokenPrices = tokenPrices && tokenPrices.length > 0;
    
    // Rest of the function using the single hasTokenPrices declaration
    let scenarioSalvageValuePerToken: number;
    let scenarioEffectivePerTokenMonthlyLease: number;
    let scenarioPricePerToken: number;
    
    // Clone current state
    let scenarioUtilization = utilizationRate;
    let scenarioSalvage = salvageRate;
    let scenarioFractionalPrice = fractionalPrice;
    
    // Apply the specific scenario change
    if (scenarioType === "utilization") {
      scenarioUtilization = scenarioValue;
    } else if (scenarioType === "salvage") {
      scenarioSalvage = scenarioValue;
    } else if (scenarioType === "tokenPrice") {
      scenarioFractionalPrice = fractionalPrice * scenarioValue;
    }
    
    // Calculate metrics for this scenario
    const scenarioUtilizationHours = (scenarioUtilization / 100) * hoursPerYear;
    const scenarioInferenceHours = (splitRatio / 100) * scenarioUtilizationHours;
    const scenarioRentalHours = scenarioUtilizationHours - scenarioInferenceHours;
    
    const scenarioInferenceRevenue = scenarioInferenceHours * model.totalTPS * (model.inferenceRate / 1_000_000) * 3600;
    const scenarioRentalRevenue = scenarioRentalHours * model.baseRentalRate * model.gpusPerServer;
    const scenarioTotalRevenue = scenarioInferenceRevenue + scenarioRentalRevenue + (scenarioFractionalPrice / 5);
    
    const scenarioTotalExpenses = model.colocationCost + model.otherExpenses + annualLeasePayments + (model.rwaiCost / 5);
    const scenarioNOI = scenarioTotalRevenue - scenarioTotalExpenses;
    const scenarioRwaiROI = (scenarioNOI / scenarioTotalExpenses) * 100;
    
    // Token holder metrics
    scenarioSalvageValuePerToken = (scenarioSalvage / 100) * model.rwaiCost / tokensPerBox;
    scenarioPricePerToken = scenarioFractionalPrice / tokensPerBox;
    
    // Calculate progressive NOI sharing for this scenario if enabled
    const scenarioProgressiveSharePercentage = calculateProgressiveSharePercentage(scenarioRwaiROI);
    
    // Calculate the NOI sharing bonus (only applies when NOI is positive)
    const scenarioShareOfNOI = scenarioNOI > 0 ? scenarioNOI * scenarioProgressiveSharePercentage : 0;
    const scenarioNOIBonus = progressiveNOI ? scenarioShareOfNOI : 0;
    
    // Token holders always get the guaranteed lease payment
    // When progressive sharing is enabled and NOI is positive, they get an ADDITIONAL bonus
    const scenarioProgressiveAnnualPayment = annualLeasePayments + scenarioNOIBonus;
    const scenarioProgressiveMonthlyPayment = scenarioProgressiveAnnualPayment / 12;
    const scenarioProgressivePerTokenMonthlyLease = scenarioProgressiveMonthlyPayment / tokensPerBox;
    
    // Use progressive or standard lease payment based on toggle
    scenarioEffectivePerTokenMonthlyLease = progressiveNOI 
      ? scenarioProgressivePerTokenMonthlyLease 
      : perTokenMonthlyLease;
    
    // Ensure monthly lease is never negative (though it shouldn't be with additive logic)
    const scenarioFinalPerTokenMonthlyLease = Math.max(0, scenarioEffectivePerTokenMonthlyLease);
    
    // Calculate IRR for this scenario with progressive sharing if enabled
    const scenarioCashFlows: number[] = [-scenarioPricePerToken];
    for (let i = 0; i < 60; i++) {
      scenarioCashFlows.push(scenarioFinalPerTokenMonthlyLease);
    }
    
    // If token price fluctuations are enabled, adjust the final value
    // Check if tokenPrices parameter is provided and not empty
    if (hasTokenPrices && enableTokenPriceFluctuations) {
      // The last token price becomes the exit value, replacing the salvage value
      scenarioCashFlows[scenarioCashFlows.length - 1] = scenarioEffectivePerTokenMonthlyLease + tokenPrices[tokenPrices.length - 1];
    } else {
      // Otherwise add the salvage value to the final payment
      scenarioCashFlows[scenarioCashFlows.length - 1] += scenarioSalvageValuePerToken;
    }
    
    const scenarioIRR = calculateIRR(scenarioCashFlows, 0.1) * 100;
    
    // Calculate ROI with progressive sharing
    // Check if tokenPrices parameter is provided and not empty
    const finalValue = hasTokenPrices && enableTokenPriceFluctuations 
      ? tokenPrices[tokenPrices.length - 1] // Use final token price if fluctuations enabled
      : scenarioSalvageValuePerToken; // Otherwise use salvage value
      
    const scenarioTotalReturn = (scenarioEffectivePerTokenMonthlyLease * 60) + finalValue;
    const scenarioNetGain = scenarioTotalReturn - pricePerToken;
    const scenarioSimpleROI = (scenarioNetGain / pricePerToken) * 100;
    
    return {
      rwaiROI: scenarioRwaiROI,
      irr: scenarioIRR,
      roi: scenarioSimpleROI,
      noi: scenarioNOI,
      salvageValue: scenarioSalvageValuePerToken,
      pricePerToken: scenarioPricePerToken,
      progressiveShare: scenarioProgressiveSharePercentage * 100,
      monthlyLease: scenarioFinalPerTokenMonthlyLease
    };
  };

  // Generate scenario data for the currently selected scenario type
  const generateScenarioData = () => {
    const scenarios = scenarioType === "utilization" ? utilizationScenarios : 
                      scenarioType === "salvage" ? salvageScenarios : tokenPriceScenarios;
    
    return scenarios.map(value => {
      return calculateScenarioResults(value, scenarioType);
    });
  };

  const scenarioResults = showScenarios ? generateScenarioData() : [];
  
  // Set min and max for the serverMonthlyLease slider based on fractionalPrice:
  // Minimum = fractionalPrice / 60, Maximum = fractionalPrice / 20.
  const leaseMin = fractionalPrice / 60;
  const leaseMax = fractionalPrice / 20;

  // Use state for line chart data to ensure proper updates
  const [lineChartData, setLineChartData] = useState({
    labels: Array.from({length: 61}, (_, i) => i.toString()),
    datasets: [
      {
        label: "Cumulative Cash Flow per Token ($)",
        data: effectiveCumulativeCashFlow,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.3)",
        fill: true,
      },
    ],
  });
  
  // Fix the second useEffect hook to prevent infinite loops
  // We'll use a more controlled approach with a ref to prevent excessive updates
  const prevCashFlowRef = useRef(effectiveCumulativeCashFlow);
  
  useEffect(() => {
    // Only update if the cash flow data has meaningfully changed
    if (JSON.stringify(prevCashFlowRef.current) !== JSON.stringify(effectiveCumulativeCashFlow)) {
      prevCashFlowRef.current = effectiveCumulativeCashFlow;
      
      setLineChartData({
        labels: Array.from({length: 61}, (_, i) => i.toString()),
        datasets: [
          {
            label: "Cumulative Cash Flow per Token ($)",
            data: effectiveCumulativeCashFlow,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.3)",
            fill: true,
          },
        ],
      });
    }
  }, [effectiveCumulativeCashFlow]);

  // Generate the data for the sensitivity analysis chart
  const generateSensitivityChartData = () => {
    const variations = generateSensitivityData();
    
    // Prepare chart data
    const labels = variations.map(v => {
      if (selectedSensitivityVariable === "utilizationRate") {
        return `${v.value}%`;
      } else if (selectedSensitivityVariable === "splitRatio") {
        return `${v.value}%`;
      } else if (selectedSensitivityVariable === "inferencePrice") {
        return `$${v.value.toFixed(2)}`;
      } else {
        return `${v.value}%`;
      }
    });
    
    return {
      labels,
      datasets: [
        {
          label: 'IRR (%)',
          data: variations.map(v => v.irr),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          tension: 0.1,
          yAxisID: 'y',
        },
        {
          label: 'NPV ($)',
          data: variations.map(v => v.npv),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.5)',
          tension: 0.1,
          yAxisID: 'y1',
        }
      ]
    };
  };

  // Helper to format percentages
  const toPercent = (val: number) => `${val.toFixed(0)}%`;

  // Calculate WACC value whenever inputs change
  useEffect(() => {
    if (useWACC) {
      const calculatedWACC = calculateWACC(
        equityPercentage / 100, 
        costOfEquity / 100, 
        debtPercentage / 100, 
        costOfDebt / 100, 
        taxRate / 100
      );
      setWaccValue(calculatedWACC * 100);
      
      // Update discount rate based on WACC
      setDiscountRate(Math.round(calculatedWACC * 100));
    }
  }, [useWACC, equityPercentage, costOfEquity, debtPercentage, costOfDebt, taxRate]);
  
  // Calculate enhanced financial metrics
  useEffect(() => {
    // Only calculate if advanced metrics are shown
    if (showAdvancedMetrics) {
      // Convert yearly discount rates to monthly for the enhanced NPV calculation
      const monthlyDiscountRates: number[] = [];
      yearlyDiscountRates.forEach(yearRate => {
        // Convert each yearly rate to 12 monthly rates
        for (let i = 0; i < 12; i++) {
          monthlyDiscountRates.push(yearRate / 100);
        }
      });
      
      // Get the appropriate cash flows based on progressive NOI setting
      const cashFlowsToUse = progressiveNOI ? progressiveCashFlows : cashFlows;
      
      // Calculate enhanced NPV with variable rates if enabled
      const npvValue = useVariableDiscountRate 
        ? calculateEnhancedNPV(cashFlowsToUse, monthlyDiscountRates) 
        : npv;
      setEnhancedNPV(npvValue);
      
      // Calculate MIRR
      const mirrResult = calculateMIRR(
        cashFlowsToUse, 
        financeRate / 100, 
        reinvestRate / 100
      );
      setMirrValue(mirrResult * 100);
      
      // Calculate discounted payback period
      const discountedPBP = calculateDiscountedPaybackPeriod(
        cashFlowsToUse, 
        discountRate / 100
      );
      setDiscountedPaybackPeriod(discountedPBP);
    }
  }, [
    showAdvancedMetrics, 
    progressiveNOI,
    cashFlows,
    progressiveCashFlows,
    useVariableDiscountRate, 
    yearlyDiscountRates, 
    discountRate, 
    financeRate, 
    reinvestRate, 
    npv
  ]);

  // Add default empty tokenPrices array for usage in functions
  const tokenPrices: number[] = []; // Initialize as empty array instead of false
  // Using the existing enableTokenPriceFluctuations state variable - no need to redeclare

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold mb-6">Financial Modeling Dashboard</h1>
        
        <Tabs defaultValue={String(selectedModel)} className="w-full">
          <TabsList>
            {Object.keys(serverModels).map(m => (
              <TabsTrigger
                key={m}
                value={m}
                onClick={() => {
                  setSelectedModel(m as ModelKey);
                  setFractionalPrice(serverModels[m as ModelKey].fractionalPrice);
                  setServerMonthlyLease(serverModels[m as ModelKey].baseLeaseYear / 12);
                  setTargetYield(18);
                }}
              >
                {m}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {/* NEW: Model Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>Model Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><strong>GPUs per Server:</strong> {model.gpusPerServer}</p>
            <p><strong>Inference TPS:</strong> {model.inferenceTPS}</p>
            <p><strong>Concurrent Requests:</strong> {model.concurrentRequests}</p>
            <p><strong>Hourly Rental Rate:</strong> ${model.baseRentalRate.toFixed(2)}</p>
            <p><strong>Assumed Inference Rate:</strong> {model.inferenceRate}</p>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Operational Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Utilization */}
              <div>
                <label className="block mb-2">Utilization Rate (%)</label>
                <input
                  type="number"
                  value={utilizationRate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUtilizationRate(Number(e.target.value))}
                  className="w-full p-2 border rounded"
                  min="0"
                  max="100"
                />
              </div>

              {/* Inference/Rental Split */}
              <div>
                <label className="block mb-2">
                  Split Ratio (Inference %): {splitRatio}
                </label>
                <Slider
                  value={[splitRatio]}
                  onValueChange={([value]: number[]) => setSplitRatio(value)}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <p className="text-gray-500 text-sm">Rental split will be {toPercent(100 - splitRatio)}.</p>
              </div>

              {/* Fractional Price */}
              <div>
                <label className="block mb-2">
                  Fractional Price: ${fractionalPrice.toLocaleString()}
                </label>
                <Slider
                  value={[fractionalPrice]}
                  onValueChange={([value]: number[]) => setFractionalPrice(value)}
                  min={model.rwaiCost}
                  max={model.rwaiCost * 3}
                  step={1000}
                  className="w-full"
                />
              </div>

              {/* Number of Tokens */}
              <div>
                <label className="block mb-2">
                  Number of Tokens: {tokensPerBox}
                </label>
                <Slider
                  value={[tokensPerBox]}
                  onValueChange={([value]: number[]) => setTokensPerBox(value)}
                  min={100}
                  max={10000}
                  step={100}
                  className="w-full"
                />
              </div>

              {/* Server Monthly Lease */}
              <div>
                <label className="block mb-2">
                  Server Monthly Lease (Total): ${serverMonthlyLease.toFixed(2)}
                </label>
                <Slider
                  value={[serverMonthlyLease]}
                  onValueChange={([value]: number[]) => setServerMonthlyLease(value)}
                  min={leaseMin}
                  max={leaseMax}
                  step={50}
                  className="w-full"
                />
                <p className="text-gray-500 text-sm">
                  Lease rate range: ${leaseMin.toFixed(2)} - ${leaseMax.toFixed(2)} (i.e., between 1/60th and 1/20th of the fractional price).
                </p>
              </div>

              {/* Salvage Rate */}
              <div>
                <label className="block mb-2">
                  Salvage Rate (%): {salvageRate}
                </label>
                <Slider
                  value={[salvageRate]}
                  onValueChange={([value]: number[]) => setSalvageRate(value)}
                  min={0}
                  max={40}
                  step={1}
                  className="w-full"
                />
              </div>
              
              {/* Progressive NOI Sharing Toggle */}
              <div>
                <label className="flex items-center space-x-2 mb-2">
                  <input 
                    type="checkbox" 
                    checked={progressiveNOI}
                    onChange={() => setProgressiveNOI(!progressiveNOI)}
                    className="form-checkbox h-5 w-5 text-blue-600"
                  />
                  <span>Enable Progressive NOI Sharing</span>
                </label>
                <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium">Status: <span className={progressiveNOI && noi > 0 ? "text-green-600" : "text-gray-600"}>
                    {progressiveNOI 
                      ? (noi > 0 ? `Active - ${(sharePercentage * 100).toFixed(1)}% of NOI` : "Waiting for positive NOI") 
                      : "Disabled"}
                  </span></p>
                  <p className="text-sm mt-1">
                    {progressiveExplanation()}
                  </p>
                  {progressiveBonus > 0 && (
                    <p className="text-sm text-green-600 font-semibold mt-1">
                      Adding ${progressiveBonus.toFixed(2)} per token monthly
                    </p>
                  )}
                  <p className="text-sm text-gray-600 mt-2">
                    With progressive sharing, token holders receive a higher percentage of NOI as RWAi's performance improves.
                    <br />
                    Tiers: 10% (default) → 15% (ROI ≥ 10%) → 20% (ROI ≥ 20%) → 25% (ROI ≥ 30%) → 30% (ROI ≥ 40%) → 35% (ROI ≥ 50%)
                  </p>
                </div>
              </div>

              {/* NEW: Advanced Financial Metrics Toggle */}
              <div>
                <label className="flex items-center space-x-2 mb-2">
                  <input 
                    type="checkbox" 
                    checked={showAdvancedMetrics}
                    onChange={() => setShowAdvancedMetrics(!showAdvancedMetrics)}
                  />
                  <span>Show Advanced Metrics</span>
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Company Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="font-medium">Total Revenue (Year)</p>
                <p className="text-2xl">${Math.round(totalRevenue).toLocaleString()}</p>
              </div>
              <div>
                <p className="font-medium">Total Expenses (Year incl. Lease)</p>
                <p className="text-2xl">${Math.round(totalExpenses).toLocaleString()}</p>
              </div>
              <div>
                <p className="font-medium">Net Operating Income (NOI)</p>
                <p className="text-2xl">${Math.round(noi).toLocaleString()}</p>
              </div>
              <div>
                <p className="font-medium">RWAi.ai ROI</p>
                <p className="text-2xl">{rwaiROI.toFixed(2)}%</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Token Holder Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg bg-white shadow-sm">
                <h3 className="text-lg font-medium mb-4">Token Holder Metrics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Price per Token</p>
                    <p className="text-lg font-medium">${pricePerToken.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Guaranteed Monthly Lease</p>
                    <p className="text-lg font-medium">${perTokenMonthlyLease.toFixed(2)}</p>
                  </div>
                  {progressiveNOI && (
                    <>
                      <div>
                        <p className="text-sm text-gray-500">NOI Sharing Bonus</p>
                        <p className={`text-lg font-medium ${progressiveBonus > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {progressiveBonus > 0 
                            ? `+$${progressiveBonus.toFixed(2)}` 
                            : "$0.00"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Total Monthly Payment</p>
                        <p className="text-lg font-medium">${effectivePerTokenMonthlyLease.toFixed(2)}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Annual Yield</p>
                    <p className="text-lg font-medium">{effectiveAnnualYield.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Salvage Value per Token</p>
                    <p className="text-lg font-medium">${salvageValuePerToken.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total ROI (5 yrs)</p>
                    <p className="text-lg font-medium">{effectiveROI.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">IRR</p>
                    <p className="text-lg font-medium">{effectiveIRR.toFixed(2)}%</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Token Holder Cash Flow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="font-medium">Breakeven Month: {breakevenMonth >= 0 ? breakevenMonth : "Not reached"}</p>
              </div>
              <div className="h-64">
                <Line data={lineChartData} options={{ maintainAspectRatio: false }} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* NEW: Expense Assumptions Card */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Assumptions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><strong>Colocation Cost (per server, yearly):</strong> ${model.colocationCost.toLocaleString()}</p>
            <p><strong>Other Expenses (per server, yearly):</strong> ${model.otherExpenses.toLocaleString()}</p>
            <p className="text-sm text-gray-500">
              Note: This dashboard does NOT account for CPU/Memory rentals or storage rentals.
            </p>
          </CardContent>
        </Card>
        
        {/* NEW: Scenario Analysis Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Scenario Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-4">
              <div>
                <label className="mr-4">Scenario Type:</label>
                <select 
                  className="p-2 border rounded"
                  value={scenarioType} 
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScenarioType(e.target.value)}
                >
                  <option value="utilization">Utilization Rate</option>
                  <option value="salvage">Salvage Rate</option>
                  <option value="tokenPrice">Token Price</option>
                </select>
              </div>
              <button
                className={`px-4 py-2 rounded ${showScenarios ? "bg-blue-600 text-white" : "bg-gray-200"}`}
                onClick={() => setShowScenarios(!showScenarios)}
              >
                {showScenarios ? "Hide Scenarios" : "Show Scenarios"}
              </button>
            </div>
            
            {showScenarios && (
              <div className="mt-4">
                <h3 className="font-bold text-lg mb-3">
                  {scenarioType === "utilization" ? "Utilization Rate Scenarios" : 
                   scenarioType === "salvage" ? "Salvage Rate Scenarios" : 
                   "Token Price Multiplier Scenarios"}
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border">Scenario</th>
                        <th className="py-2 px-4 border">IRR (%)</th>
                        <th className="py-2 px-4 border">ROI (%)</th>
                        <th className="py-2 px-4 border">NOI ($)</th>
                        <th className="py-2 px-4 border">Token Price ($)</th>
                        <th className="py-2 px-4 border">Salvage Value ($)</th>
                        <th className="py-2 px-4 border">RWAi ROI (%)</th>
                        <th className="py-2 px-4 border">Progressive Share (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scenarioType === "utilization" ? utilizationScenarios : 
                        scenarioType === "salvage" ? salvageScenarios : 
                        tokenPriceScenarios).map((value, index) => {
                        const result = scenarioResults[index];
                        const scenarioLabel = scenarioType === "utilization" ? `${value}%` : 
                                             scenarioType === "salvage" ? `${value}%` : 
                                             `${value}x`;
                        return (
                          <tr key={index} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                            <td className="py-2 px-4 border">{scenarioLabel}</td>
                            <td className="py-2 px-4 border">{result.irr.toFixed(2)}</td>
                            <td className="py-2 px-4 border">{result.roi.toFixed(2)}</td>
                            <td className="py-2 px-4 border">${Math.round(result.noi).toLocaleString()}</td>
                            <td className="py-2 px-4 border">${result.pricePerToken.toFixed(2)}</td>
                            <td className="py-2 px-4 border">${result.salvageValue.toFixed(2)}</td>
                            <td className="py-2 px-4 border">{result.rwaiROI.toFixed(2)}</td>
                            <td className="py-2 px-4 border">{result.progressiveShare.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* NEW: Excel Export Feature */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Export Data</CardTitle>
          </CardHeader>
          <CardContent>
            <button
              className="px-6 py-3 bg-green-600 text-white rounded font-bold"
              onClick={() => {
                // Function to generate CSV data
                const generateCsv = () => {
                  // Headers
                  let csv = "Model,Parameter,Value\n";
                  
                  // Model Details
                  csv += `${selectedModel},GPU Count,${model.gpusPerServer}\n`;
                  csv += `${selectedModel},Inference TPS,${model.inferenceTPS}\n`;
                  csv += `${selectedModel},Concurrent Requests,${model.concurrentRequests}\n`;
                  csv += `${selectedModel},Hourly Rental Rate,${model.baseRentalRate}\n`;
                  csv += `${selectedModel},Inference Rate,${model.inferenceRate}\n`;
                  
                  // Financial Metrics
                  csv += `${selectedModel},Price Per Token,${pricePerToken.toFixed(2)}\n`;
                  csv += `${selectedModel},Monthly Lease Per Token,${effectivePerTokenMonthlyLease.toFixed(2)}\n`;
                  csv += `${selectedModel},Annual Yield,${effectiveAnnualYield.toFixed(2)}\n`;
                  csv += `${selectedModel},Salvage Value Per Token,${salvageValuePerToken.toFixed(2)}\n`;
                  csv += `${selectedModel},5yr ROI,${effectiveROI.toFixed(2)}\n`;
                  csv += `${selectedModel},Annual ROI (CAGR),${cagr.toFixed(2)}\n`;
                  csv += `${selectedModel},IRR,${effectiveIRR.toFixed(2)}\n`;
                  
                  // Operational Parameters
                  csv += `${selectedModel},Utilization Rate,${utilizationRate}\n`;
                  csv += `${selectedModel},Split Ratio,${splitRatio}\n`;
                  csv += `${selectedModel},Fractional Price,${fractionalPrice}\n`;
                  csv += `${selectedModel},Tokens Per Box,${tokensPerBox}\n`;
                  csv += `${selectedModel},Server Monthly Lease,${serverMonthlyLease.toFixed(2)}\n`;
                  csv += `${selectedModel},Salvage Rate,${salvageRate}\n`;
                  
                  // Company Metrics
                  csv += `${selectedModel},Total Revenue,${Math.round(totalRevenue)}\n`;
                  csv += `${selectedModel},Total Expenses,${Math.round(totalExpenses)}\n`;
                  csv += `${selectedModel},NOI,${Math.round(noi)}\n`;
                  csv += `${selectedModel},RWAi ROI,${rwaiROI.toFixed(2)}\n`;
                  
                  // Cash Flow Data
                  csv += "\nMonth,Cumulative Cash Flow\n";
                  effectiveCumulativeCashFlow.forEach((flow, month) => {
                    csv += `${month},${flow.toFixed(2)}\n`;
                  });
                  
                  // Scenario Analysis if visible
                  if (showScenarios) {
                    csv += "\nScenario Analysis\n";
                    csv += `Scenario Type,${scenarioType}\n`;
                    csv += "Value,IRR,ROI,NOI,Token Price,Salvage Value,RWAi ROI,Progressive Share\n";
                    
                    const scenarios = scenarioType === "utilization" ? utilizationScenarios : 
                                     scenarioType === "salvage" ? salvageScenarios : 
                                     tokenPriceScenarios;
                    
                    scenarios.forEach((value, index) => {
                      const result = scenarioResults[index];
                      csv += `${String(value)},${result.irr.toFixed(2)},${result.roi.toFixed(2)},${Math.round(result.noi)},${result.pricePerToken.toFixed(2)},${result.salvageValue.toFixed(2)},${result.rwaiROI.toFixed(2)},${result.progressiveShare.toFixed(2)}\n`;
                    });
                  }
                  
                  // Advanced metrics
                  csv += `${selectedModel},Progressive NOI Sharing,${progressiveNOI ? "Enabled" : "Disabled"}\n`;
                  if (showAdvancedMetrics) {
                    csv += `${selectedModel},NPV,${npv.toFixed(2)}\n`;
                    csv += `${selectedModel},MOIC,${moic.toFixed(2)}\n`;
                    csv += `${selectedModel},Payback Period,${paybackPeriod.toFixed(1)}\n`;
                    csv += `${selectedModel},Profitability Index,${profitabilityIndex.toFixed(2)}\n`;
                    csv += `${selectedModel},Discount Rate,${discountRate}\n`;
                    
                    // Add sensitivity analysis table
                    csv += "\nSensitivity Analysis\n";
                    csv += `Variable,${selectedSensitivityVariable === "utilizationRate" ? "Utilization Rate" : 
                                selectedSensitivityVariable === "splitRatio" ? "Inference/Rental Split" : 
                                selectedSensitivityVariable === "inferencePrice" ? "Inference Price" :
                                "Discount Rate"}\n`;
                    csv += "Value,IRR,NPV,Monthly Lease,ROI\n";
                    
                    sensitivityData.forEach(d => {
                      csv += `${d.value},${d.irr.toFixed(2)},${d.npv.toFixed(2)},${d.monthlyLease.toFixed(2)},${d.roi.toFixed(2)}\n`;
                    });
                  }
                  
                  return csv;
                };
                
                // Generate the CSV content
                const csvContent = generateCsv();
                
                // Create a Blob and download link
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `${selectedModel}_financial_model.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              Export to CSV
            </button>
            <p className="mt-2 text-sm text-gray-500">
              Download the financial model as a CSV file that can be opened in Excel for further analysis
            </p>
          </CardContent>
        </Card>

        {/* NEW: Risk Assessment & Monte Carlo Simulations */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Risk Assessment & Monte Carlo Simulations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-4">
              <div>
                <label className="mr-4">Simulation Metric:</label>
                <select 
                  className="p-2 border rounded"
                  value={simulationMetric} 
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSimulationMetric(e.target.value)}
                >
                  <option value="IRR">IRR (%)</option>
                  <option value="ROI">ROI (%)</option>
                  <option value="MonthlyLease">Monthly Lease ($)</option>
                  <option value="NOI">Net Operating Income ($)</option>
                </select>
              </div>
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white"
                onClick={runMonteCarloSimulation}
              >
                Run Simulation
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block mb-2">Utilization Rate Variation (Std Dev)</label>
                <div className="flex items-center">
                  <Slider
                    value={[utilizationStdDev]}
                    onValueChange={([value]: number[]) => setUtilizationStdDev(value)}
                    min={1}
                    max={30}
                    step={1}
                    className="w-full mr-4"
                  />
                  <span className="text-sm">{utilizationStdDev.toFixed(0)}%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Higher values mean more uncertainty in utilization projections
                </p>
              </div>
              
              <div>
                <label className="block mb-2">Salvage Rate Variation (Std Dev)</label>
                <div className="flex items-center">
                  <Slider
                    value={[salvageStdDev]}
                    onValueChange={([value]: number[]) => setSalvageStdDev(value)}
                    min={1}
                    max={15}
                    step={1}
                    className="w-full mr-4"
                  />
                  <span className="text-sm">{salvageStdDev.toFixed(0)}%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Higher values mean more uncertainty in salvage value projections
                </p>
              </div>
              
              <div>
                <label className="block mb-2">Number of Simulations</label>
                <div className="flex items-center">
                  <Slider
                    value={[monteCarloSimulations]}
                    onValueChange={([value]: number[]) => setMonteCarloSimulations(value)}
                    min={100}
                    max={10000}
                    step={100}
                    className="w-full mr-4"
                  />
                  <span className="text-sm">{monteCarloSimulations.toLocaleString()}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  More simulations provide more accurate results but take longer to compute
                </p>
              </div>
              
              <div className="col-span-1 md:col-span-2 pt-4 border-t mt-4">
                <div className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    id="enable-token-price-fluctuations"
                    checked={enableTokenPriceFluctuations}
                    onChange={(e) => setEnableTokenPriceFluctuations(e.target.checked)}
                    className="mr-2"
                  />
                  <label 
                    htmlFor="enable-token-price-fluctuations" 
                    className="font-medium"
                  >
                    Enable Token Price Fluctuations
                  </label>
                </div>
                
                {enableTokenPriceFluctuations && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block mb-2">Token Price Volatility (%)</label>
                      <div className="flex items-center">
                        <Slider
                          value={[tokenPriceVolatility]}
                          onValueChange={([value]: number[]) => setTokenPriceVolatility(value)}
                          min={5}
                          max={100}
                          step={1}
                          className="w-full mr-4"
                        />
                        <span className="text-sm">{tokenPriceVolatility.toFixed(0)}%</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Annual volatility of token price (higher = more price movement)
                      </p>
                    </div>
                    
                    <div>
                      <label className="block mb-2">Token Price Drift (%)</label>
                      <div className="flex items-center">
                        <Slider
                          value={[tokenPriceDrift]}
                          onValueChange={([value]: number[]) => setTokenPriceDrift(value)}
                          min={-20}
                          max={20}
                          step={1}
                          className="w-full mr-4"
                        />
                        <span className="text-sm">{tokenPriceDrift > 0 ? '+' : ''}{tokenPriceDrift.toFixed(0)}%</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Annual expected change in token price (positive = growth, negative = decline)
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {simulationResults && (
              <div className="mt-6">
                <h3 className="text-lg font-bold mb-4">Simulation Results: {simulationMetric}</h3>
                
                <MonteCarloChart 
                  simulationResult={simulationResults}
                  title={`Distribution of ${simulationMetric}`}
                  xAxisLabel={simulationMetric === "MonthlyLease" ? "Monthly Lease ($)" : 
                             simulationMetric === "NOI" ? "Net Operating Income ($)" :
                             `${simulationMetric} (%)`}
                />
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-bold mb-2">Risk Metrics</h4>
                    <p><strong>95% Value at Risk:</strong> {simulationResults.VaR95.toFixed(2)}</p>
                    <p><strong>99% Value at Risk:</strong> {simulationResults.VaR99.toFixed(2)}</p>
                    <p><strong>95% Expected Shortfall:</strong> {simulationResults.expectedShortfall95.toFixed(2)}</p>
                  </div>
                  
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-bold mb-2">Percentiles</h4>
                    <p><strong>5th Percentile:</strong> {simulationResults.percentiles.p5.toFixed(2)}</p>
                    <p><strong>50th Percentile (Median):</strong> {simulationResults.percentiles.p50.toFixed(2)}</p>
                    <p><strong>95th Percentile:</strong> {simulationResults.percentiles.p95.toFixed(2)}</p>
                  </div>
                  
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-bold mb-2">Statistical Summary</h4>
                    <p><strong>Mean:</strong> {simulationResults.mean.toFixed(2)}</p>
                    <p><strong>Standard Deviation:</strong> {simulationResults.std.toFixed(2)}</p>
                    <p><strong>Range:</strong> {simulationResults.min.toFixed(2)} to {simulationResults.max.toFixed(2)}</p>
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-bold mb-2">Probability Analysis</h4>
                  {simulationMetric === "IRR" && (
                    <>
                      <p><strong>Probability of IRR {'>'} {Math.round(effectiveIRR)}%:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, effectiveIRR) * 100).toFixed(2)}%</p>
                      <p><strong>Probability of IRR {'>'} 20%:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, 20) * 100).toFixed(2)}%</p>
                      <p><strong>Probability of IRR {'>'} 30%:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, 30) * 100).toFixed(2)}%</p>
                    </>
                  )}
                  
                  {simulationMetric === "ROI" && (
                    <>
                      <p><strong>Probability of ROI {'>'} {Math.round(effectiveROI)}%:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, effectiveROI) * 100).toFixed(2)}%</p>
                      <p><strong>Probability of ROI {'>'} 100%:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, 100) * 100).toFixed(2)}%</p>
                      <p><strong>Probability of ROI {'>'} 150%:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, 150) * 100).toFixed(2)}%</p>
                    </>
                  )}
                  
                  {simulationMetric === "MonthlyLease" && (
                    <>
                      <p><strong>Probability of Monthly Lease {'>'} ${effectivePerTokenMonthlyLease.toFixed(2)}:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, effectivePerTokenMonthlyLease) * 100).toFixed(2)}%</p>
                      <p><strong>Probability of Monthly Lease {'>'} ${(effectivePerTokenMonthlyLease * 1.2).toFixed(2)}:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, effectivePerTokenMonthlyLease * 1.2) * 100).toFixed(2)}%</p>
                      <p><strong>Probability of Monthly Lease {'>'} ${(effectivePerTokenMonthlyLease * 1.5).toFixed(2)}:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, effectivePerTokenMonthlyLease * 1.5) * 100).toFixed(2)}%</p>
                    </>
                  )}
                  
                  {simulationMetric === "NOI" && (
                    <>
                      <p><strong>Probability of NOI {'>'} ${Math.round(noi).toLocaleString()}:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, noi) * 100).toFixed(2)}%</p>
                      <p><strong>Probability of NOI {'>'} ${Math.round(noi * 1.2).toLocaleString()}:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, noi * 1.2) * 100).toFixed(2)}%</p>
                      <p><strong>Probability of NOI {'>'} ${Math.round(noi * 1.5).toLocaleString()}:</strong> {(MonteCarloSim.probabilityOfAchievingTarget(simulationResults, noi * 1.5) * 100).toFixed(2)}%</p>
                    </>
                  )}
                </div>
                
                <div className="mt-4 text-sm text-gray-500">
                  <p>
                    <strong>Note:</strong> These simulations account for uncertainty in utilization rates and salvage values. 
                    The results show a range of possible outcomes based on {monteCarloSimulations.toLocaleString()} random scenarios.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Advanced Metrics Card - only shown when toggle is enabled */}
        {showAdvancedMetrics && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Advanced Financial Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="block mb-2">
                  Discount Rate (%): {discountRate}
                </label>
                <Slider
                  value={[discountRate]}
                  onValueChange={([value]: number[]) => setDiscountRate(value)}
                  min={5}
                  max={25}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Used for Net Present Value (NPV) calculation
                </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 text-sm">Net Present Value (NPV)</p>
                  <p className="text-xl font-bold">${npv.toFixed(2)}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 text-sm">Multiple on Invested Capital (MOIC)</p>
                  <p className="text-xl font-bold">{moic.toFixed(2)}x</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 text-sm">Payback Period</p>
                  <p className="text-xl font-bold">{paybackPeriod.toFixed(1)} months</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 text-sm">Profitability Index (PI)</p>
                  <p className="text-xl font-bold">{profitabilityIndex.toFixed(2)}</p>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-3">Sensitivity Analysis</h3>
                <div className="mb-4">
                  <select 
                    className="p-2 border rounded w-full"
                    value={selectedSensitivityVariable} 
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedSensitivityVariable(e.target.value)}
                  >
                    <option value="utilizationRate">Utilization Rate</option>
                    <option value="splitRatio">Inference/Rental Split Ratio</option>
                    <option value="inferencePrice">Inference Price (per million tokens)</option>
                    <option value="discountRate">Discount Rate</option>
                  </select>
                </div>
                <div className="h-64">
                  <Line data={sensitivityChartData} options={sensitivityChartOptions} />
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  This chart shows how changes in {selectedSensitivityVariable === "utilizationRate" ? "Utilization Rate" : 
                                             selectedSensitivityVariable === "splitRatio" ? "Inference/Rental Split Ratio" : 
                                             selectedSensitivityVariable === "inferencePrice" ? "Inference Price" :
                                             "Discount Rate"} impact IRR and NPV.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {showAdvancedMetrics && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Advanced Financial Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* DCF Analysis Controls */}
              <div className="p-4 border rounded-lg bg-white shadow-sm">
                <h3 className="text-lg font-medium mb-4">DCF Analysis Configuration</h3>
                
                {/* Variable Discount Rate Toggle */}
                <div className="mb-4">
                  <label className="flex items-center space-x-2 mb-2">
                    <input 
                      type="checkbox" 
                      checked={useVariableDiscountRate}
                      onChange={() => setUseVariableDiscountRate(!useVariableDiscountRate)}
                      className="form-checkbox h-5 w-5 text-blue-600"
                    />
                    <span>Use Variable Discount Rates</span>
                  </label>
                  
                  {useVariableDiscountRate && (
                    <div className="pl-7 space-y-2">
                      <p className="text-sm text-gray-500 mb-2">Set discount rate for each year:</p>
                      <div className="grid grid-cols-5 gap-2">
                        {yearlyDiscountRates.map((rate, index) => (
                          <div key={index} className="flex flex-col">
                            <label className="text-xs text-gray-500">Year {index + 1}</label>
                            <input 
                              type="number" 
                              value={rate}
                              min="0"
                              max="100"
                              onChange={(e) => {
                                const newRates = [...yearlyDiscountRates];
                                newRates[index] = parseFloat(e.target.value) || 0;
                                setYearlyDiscountRates(newRates);
                              }}
                              className="p-1 border rounded text-sm w-full"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* WACC Calculator Toggle */}
                <div className="mb-4">
                  <label className="flex items-center space-x-2 mb-2">
                    <input 
                      type="checkbox" 
                      checked={useWACC}
                      onChange={() => setUseWACC(!useWACC)}
                      className="form-checkbox h-5 w-5 text-blue-600"
                    />
                    <span>Calculate Using WACC</span>
                  </label>
                  
                  {useWACC && (
                    <div className="pl-7 space-y-3">
                      <p className="text-sm text-gray-500 mb-2">WACC Parameters:</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm">Equity %</label>
                          <Slider
                            value={[equityPercentage]}
                            onValueChange={([value]: number[]) => {
                              setEquityPercentage(value);
                              setDebtPercentage(100 - value);
                            }}
                            min={0}
                            max={100}
                            step={1}
                            className="my-2"
                          />
                          <div className="flex justify-between">
                            <span className="text-xs">{equityPercentage}%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm">Debt %</label>
                          <Slider
                            value={[debtPercentage]}
                            onValueChange={([value]: number[]) => {
                              setDebtPercentage(value);
                              setEquityPercentage(100 - value);
                            }}
                            min={0}
                            max={100}
                            step={1}
                            className="my-2"
                          />
                          <div className="flex justify-between">
                            <span className="text-xs">{debtPercentage}%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm">Cost of Equity %</label>
                          <Slider
                            value={[costOfEquity]}
                            onValueChange={([value]: number[]) => setCostOfEquity(value)}
                            min={0}
                            max={30}
                            step={0.1}
                            className="my-2"
                          />
                          <div className="flex justify-between">
                            <span className="text-xs">{costOfEquity.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm">Cost of Debt %</label>
                          <Slider
                            value={[costOfDebt]}
                            onValueChange={([value]: number[]) => setCostOfDebt(value)}
                            min={0}
                            max={20}
                            step={0.1}
                            className="my-2"
                          />
                          <div className="flex justify-between">
                            <span className="text-xs">{costOfDebt.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm">Tax Rate %</label>
                          <Slider
                            value={[taxRate]}
                            onValueChange={([value]: number[]) => setTaxRate(value)}
                            min={0}
                            max={40}
                            step={0.5}
                            className="my-2"
                          />
                          <div className="flex justify-between">
                            <span className="text-xs">{taxRate.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-center">
                          <div className="bg-blue-50 p-3 rounded-lg text-center">
                            <p className="text-xs text-gray-600">Calculated WACC</p>
                            <p className="text-lg font-bold text-blue-800">{waccValue.toFixed(2)}%</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* MIRR Parameters */}
                <div className="mb-4">
                  <h4 className="text-md font-medium mb-2">MIRR Parameters</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm">Finance Rate %</label>
                      <Slider
                        value={[financeRate]}
                        onValueChange={([value]: number[]) => setFinanceRate(value)}
                        min={0}
                        max={20}
                        step={0.5}
                        className="my-2"
                      />
                      <div className="flex justify-between">
                        <span className="text-xs">{financeRate.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm">Reinvestment Rate %</label>
                      <Slider
                        value={[reinvestRate]}
                        onValueChange={([value]: number[]) => setReinvestRate(value)}
                        min={0}
                        max={20}
                        step={0.5}
                        className="my-2"
                      />
                      <div className="flex justify-between">
                        <span className="text-xs">{reinvestRate.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Advanced Financial Metrics Results */}
              <div className="p-4 border rounded-lg bg-white shadow-sm">
                <h3 className="text-lg font-medium mb-4">Advanced Financial Metrics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-gray-500 text-sm">Enhanced NPV</p>
                    <p className="text-xl font-bold">${enhancedNPV.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">{useVariableDiscountRate ? 'Variable rates' : 'Standard rate'}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-gray-500 text-sm">Modified IRR (MIRR)</p>
                    <p className="text-xl font-bold">{mirrValue.toFixed(2)}%</p>
                    <p className="text-xs text-gray-500">Finance: {financeRate}% / Reinvest: {reinvestRate}%</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-gray-500 text-sm">Discounted Payback Period</p>
                    <p className="text-xl font-bold">{discountedPaybackPeriod.toFixed(1)} months</p>
                    <p className="text-xs text-gray-500">Time to recover investment (discounted)</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-gray-500 text-sm">Profitability Index</p>
                    <p className="text-xl font-bold">{(enhancedNPV / pricePerToken + 1).toFixed(2)}</p>
                    <p className="text-xs text-gray-500">Present Value / Initial Investment</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default FinancialDashboard;