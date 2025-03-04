import React from 'react';
import { Bar } from 'react-chartjs-2';
import { SimulationResult } from '@/lib/monte-carlo';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Chart as ChartJS, registerables } from 'chart.js';

// Register the annotation plugin
ChartJS.register(...registerables, annotationPlugin);

type MonteCarloChartProps = {
  simulationResult: SimulationResult;
  title: string;
  xAxisLabel: string;
  yAxisLabel?: string;
  colorPrimary?: string;
  colorSecondary?: string;
};

const MonteCarloChart: React.FC<MonteCarloChartProps> = ({ 
  simulationResult, 
  title, 
  xAxisLabel, 
  yAxisLabel = 'Frequency',
  colorPrimary = 'rgba(54, 162, 235, 0.6)',
  colorSecondary = 'rgba(54, 162, 235, 1)'
}) => {
  const { histogram, mean, median, percentiles } = simulationResult;
  
  // Format the bin labels
  const binLabels = histogram.bins.slice(0, -1).map((bin, index) => {
    const nextBin = histogram.bins[index + 1];
    return `${bin.toFixed(2)}-${nextBin.toFixed(2)}`;
  });

  // Find which bin contains the mean and median
  const findBinIndex = (value: number): number => {
    for (let i = 0; i < histogram.bins.length - 1; i++) {
      if (value >= histogram.bins[i] && value < histogram.bins[i + 1]) {
        return i;
      }
    }
    // Fallback to last bin if not found
    return histogram.bins.length - 2;
  };

  const meanBinIndex = findBinIndex(mean);
  const medianBinIndex = findBinIndex(median);

  const data = {
    labels: binLabels,
    datasets: [
      {
        label: 'Frequency',
        data: histogram.frequencies,
        backgroundColor: colorPrimary,
        borderColor: colorSecondary,
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          title: function(tooltipItems: any) {
            return tooltipItems[0].label;
          },
          label: function(context: any) {
            return `Frequency: ${context.raw}`;
          }
        }
      },
      title: {
        display: true,
        text: title,
      },
      annotation: {
        annotations: {
          line1: {
            type: 'line' as const,
            yMin: 0,
            yMax: Math.max(...histogram.frequencies),
            xMin: meanBinIndex,
            xMax: meanBinIndex,
            borderColor: 'rgba(255, 99, 132, 0.8)',
            borderWidth: 2,
            label: {
              display: true,
              content: `Mean: ${mean.toFixed(2)}`,
              position: 'start' as const
            }
          },
          line2: {
            type: 'line' as const,
            yMin: 0,
            yMax: Math.max(...histogram.frequencies),
            xMin: medianBinIndex,
            xMax: medianBinIndex,
            borderColor: 'rgba(75, 192, 192, 0.8)',
            borderWidth: 2,
            label: {
              display: true,
              content: `Median: ${median.toFixed(2)}`,
              position: 'end' as const
            }
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: xAxisLabel,
        },
      },
      y: {
        title: {
          display: true,
          text: yAxisLabel,
        },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="relative h-80 mb-8">
      <Bar data={data} options={options} />
      <div className="mt-8 pt-2 grid grid-cols-3 gap-4 text-sm overflow-hidden">
        <div className="p-3 bg-gray-50 rounded overflow-hidden">
          <p className="font-medium mb-1">Mean</p>
          <p className="truncate">{mean.toFixed(2)}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded overflow-hidden">
          <p className="font-medium mb-1">Median</p>
          <p className="truncate">{median.toFixed(2)}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded overflow-hidden">
          <p className="font-medium mb-1">Std Dev</p>
          <p className="truncate">{simulationResult.std.toFixed(2)}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded overflow-hidden">
          <p className="font-medium mb-1">95% VaR</p>
          <p className="truncate">{simulationResult.VaR95.toFixed(2)}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded overflow-hidden">
          <p className="font-medium mb-1">P10</p>
          <p className="truncate">{percentiles.p10.toFixed(2)}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded overflow-hidden">
          <p className="font-medium mb-1">P90</p>
          <p className="truncate">{percentiles.p90.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

export default MonteCarloChart; 