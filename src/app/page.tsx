"use client";
import React, { useState, useEffect } from 'react';
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

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, PointElement, LineElement, Legend);

// Complete server model data:
const serverModels = {
  RTX5090: {
    inferenceTPS: 100,
    concurrentRequests: 4,
    gpusPerServer: 7,
    totalTPS: 4900,
    baseRentalRate: 0.4,
    inferenceRate: 0.3,
    pandsCost: 32500,
    fractionalPrice: 60000,
    colocationCost: 6000,
    otherExpenses: 1400,
    baseLeaseYear: 16800,
    monthlyLeasePerToken: 1.90
  },
  A100: {
    inferenceTPS: 130,
    concurrentRequests: 7,
    gpusPerServer: 7,
    totalTPS: 6370,
    baseRentalRate: 0.75,
    inferenceRate: 0.3,
    pandsCost: 50000,
    fractionalPrice: 80000,
    colocationCost: 6600,
    otherExpenses: 2200,
    baseLeaseYear: 30400,
    monthlyLeasePerToken: 2.533
  },
  H100: {
    inferenceTPS: 600,
    concurrentRequests: 16,
    gpusPerServer: 10,
    totalTPS: 60000,
    baseRentalRate: 1.6,
    inferenceRate: 0.3,
    pandsCost: 225000,
    fractionalPrice: 400000,
    colocationCost: 18000,
    otherExpenses: 3600,
    baseLeaseYear: 152000,
    monthlyLeasePerToken: 12.667
  },
  H200: {
    inferenceTPS: 1200,
    concurrentRequests: 24,
    gpusPerServer: 10,
    totalTPS: 120000,
    baseRentalRate: 2.25,
    inferenceRate: 0.3,
    pandsCost: 275000,
    fractionalPrice: 500000,
    colocationCost: 19200,
    otherExpenses: 4200,
    baseLeaseYear: 190000,
    monthlyLeasePerToken: 15.833
  },
  GB200: {
    inferenceTPS: 6000,
    concurrentRequests: 36,
    gpusPerServer: 10,
    totalTPS: 600000,
    baseRentalRate: 4.25,
    inferenceRate: 0.3,
    pandsCost: 500000,
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


// Calculate yield from per-token monthly lease and token price using:
// Yield (%) = (((perTokenMonthlyLease * 60) - pricePerToken) / pricePerToken) / 5 * 100
const calcYieldFromLease = (
  perTokenMonthlyLease: number,
  pricePerToken: number
): number => {
  return (((perTokenMonthlyLease * 60) - pricePerToken) / pricePerToken) / 5 * 100;
};

const FinancialDashboard = () => {
  // User inputs:
  const [selectedModel, setSelectedModel] = useState<keyof typeof serverModels>("RTX5090");
  const [utilizationRate, setUtilizationRate] = useState<number>(60);   // in %
  const [splitRatio, setSplitRatio] = useState<number>(50);            // inference % (0-100)
  const [tokensPerBox, setTokensPerBox] = useState<number>(1000);
  const [fractionalPrice, setFractionalPrice] = useState<number>(serverModels["RTX5090"].fractionalPrice);
  const [targetYield, setTargetYield] = useState<number>(18);           // annual yield in %
  const [salvageRate, setSalvageRate] = useState<number>(20);           // salvage rate in %

  // Total server monthly lease (independent slider)
  const [serverMonthlyLease, setServerMonthlyLease] = useState<number>(serverModels["RTX5090"].baseLeaseYear / 12);

  // Derived values:
  const model = serverModels[selectedModel];
  const pricePerToken = fractionalPrice / tokensPerBox;
  const salvageValuePerToken = (salvageRate / 100) * model.pandsCost / tokensPerBox;
  // Per-token monthly lease is simply total lease divided by tokens.
  const perTokenMonthlyLease = serverMonthlyLease / tokensPerBox;

  // Compute cumulative token cash flow (per token) over 60 months
  const cumulativeCashFlow = [];
  let cumSum = -pricePerToken;
  cumulativeCashFlow.push(cumSum);
  for (let i = 1; i <= 60; i++) {
    cumSum += perTokenMonthlyLease;
    if (i === 60) {
      cumSum += salvageValuePerToken;
    }
    cumulativeCashFlow.push(cumSum);
  }
  // Determine breakeven month: first month where cumulative cash flow is >= 0
  const breakevenMonth = cumulativeCashFlow.findIndex((val) => val >= 0);

  
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

  // PandS.ai Revenue Calculations (server-level)
  const hoursPerYear = 8760;
  const utilizationHours = (utilizationRate / 100) * hoursPerYear;
  const inferenceHours = (splitRatio / 100) * utilizationHours;
  const rentalHours = utilizationHours - inferenceHours;
  const inferenceRevenue = inferenceHours * model.totalTPS * (model.inferenceRate / 1_000_000) * 3600;
  const rentalRevenue = rentalHours * model.baseRentalRate * model.gpusPerServer;
  const totalRevenue = inferenceRevenue + rentalRevenue + (fractionalPrice / 5);

  // Operating Expenses for the server:
  const annualLeasePayments = serverMonthlyLease * 12;
  const totalExpenses = model.colocationCost + model.otherExpenses + annualLeasePayments + (model.pandsCost / 5);
  const noi = totalRevenue - totalExpenses;
  const pandsROI = (noi / totalExpenses) * 100;

  // Set min and max for the serverMonthlyLease slider based on fractionalPrice:
  // Minimum = fractionalPrice / 60, Maximum = fractionalPrice / 20.
  const leaseMin = fractionalPrice / 60;
  const leaseMax = fractionalPrice / 20;

  // Chart selection state
  const [selectedChart, setSelectedChart] = useState<string>("revenue");

  // Prepare chart data for Revenue Breakdown (Pie Chart)
  const revenueData = {
    labels: ["Inference Revenue", "Rental Revenue"],
    datasets: [
      {
        data: [inferenceRevenue, rentalRevenue],
        backgroundColor: ["#4ade80", "#60a5fa"],
        hoverBackgroundColor: ["#22c55e", "#3b82f6"],
      },
    ],
  };

  // Prepare chart data for PandS.ai Metrics (Bar Chart)
  const metricsData = {
    labels: ["Total Revenue", "Total Expenses", "NOI"],
    datasets: [
      {
        label: "Amount ($)",
        data: [totalRevenue, totalExpenses, noi],
        backgroundColor: ["#34d399", "#f87171", "#60a5fa"],
      },
    ],
  };

  // Prepare data for the line chart (months 0 to 60)
  const lineChartData = {
    labels: cumulativeCashFlow.map((_, index) => index.toString()),
    datasets: [
      {
        label: "Cumulative Cash Flow per Token ($)",
        data: cumulativeCashFlow,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.3)",
        fill: true,
      },
    ],
  };

  // Helper to format percentages
  const toPercent = (val: number) => `${val.toFixed(0)}%`;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold mb-6">Financial Modeling Dashboard</h1>
      
      <Tabs defaultValue={selectedModel} className="w-full">
        <TabsList>
          {Object.keys(serverModels).map(m => (
            <TabsTrigger
              key={m}
              value={m}
              onClick={() => {
                setSelectedModel(m as keyof typeof serverModels);
                setFractionalPrice(serverModels[m as keyof typeof serverModels].fractionalPrice);
                setServerMonthlyLease(serverModels[m as keyof typeof serverModels].baseLeaseYear / 12);
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
                onChange={(e) => setUtilizationRate(Number(e.target.value))}
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
                onValueChange={([value]) => setSplitRatio(value)}
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
                onValueChange={([value]) => setFractionalPrice(value)}
                min={model.pandsCost}
                max={model.pandsCost * 3}
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
                onValueChange={([value]) => setTokensPerBox(value)}
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
                onValueChange={([value]) => setServerMonthlyLease(value)}
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
                onValueChange={([value]) => setSalvageRate(value)}
                min={0}
                max={40}
                step={1}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Token Holder Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-medium">Price per Token</p>
              <p className="text-2xl">${pricePerToken.toFixed(2)}</p>
            </div>
            <div>
              <p className="font-medium">Monthly Lease per Token</p>
              <p className="text-2xl">${perTokenMonthlyLease.toFixed(2)}</p>
            </div>
            <div>
              <p className="font-medium">Annual Yield</p>
              <p className="text-2xl">{targetYield.toFixed(2)}%</p>
            </div>
            <div>
              <p className="font-medium">Salvage Value per Token</p>
              <p className="text-2xl">${salvageValuePerToken.toFixed(2)}</p>
            </div>
            <div>
              <p className="font-medium">Total ROI (5 yrs)</p>
              <p className="text-2xl">{simpleROI.toFixed(2)}%</p>
            </div>
            <div>
              <p className="font-medium">Annual ROI (CAGR)</p>
              <p className="text-2xl">{cagr.toFixed(2)}%</p>
            </div>
            <div>
              <p className="font-medium">IRR</p>
              <p className="text-2xl">{irrVal.toFixed(2)}%</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PandS.ai Metrics</CardTitle>
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
              <p className="font-medium">PandS.ai ROI</p>
              <p className="text-2xl">{pandsROI.toFixed(2)}%</p>
            </div>
          </CardContent>
        </Card>
        {/* New Card: Token Holder Cash Flow Chart */}
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


      {/* Chart Selector */}
      <div className="mt-8">
        <div className="flex space-x-4 mb-4">
          <button
            className={`px-4 py-2 rounded ${selectedChart === "revenue" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
            onClick={() => setSelectedChart("revenue")}
          >
            Revenue Breakdown
          </button>
          <button
            className={`px-4 py-2 rounded ${selectedChart === "metrics" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
            onClick={() => setSelectedChart("metrics")}
          >
            PandS.ai Metrics
          </button>
        </div>
        {selectedChart === "revenue" && (
          <div className="bg-white p-4 rounded shadow">
            <Pie data={revenueData} />
          </div>
        )}
        {selectedChart === "metrics" && (
          <div className="bg-white p-4 rounded shadow">
            <Bar
              data={metricsData}
              options={{
                responsive: true,
                plugins: {
                  legend: { position: 'top' },
                  title: { display: true, text: 'PandS.ai Metrics (Yearly)' },
                },
              }}
            />
          </div>
        )}
        </div>
    </div>
  );
};

export default FinancialDashboard;

