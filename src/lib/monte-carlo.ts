/**
 * Monte Carlo Simulation Utilities for Financial Modeling
 * This module provides functions for conducting Monte Carlo simulations
 * to assess risk and analyze probability distributions of financial outcomes.
 */

import * as jStat from 'jstat';
import seedrandom from 'seedrandom';

/**
 * Simulation result type definition
 */
export type SimulationResult = {
  values: number[];
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
  percentiles: Record<string, number>;
  VaR95: number;
  VaR99: number;
  expectedShortfall95: number;
  histogram: {
    bins: number[];
    frequencies: number[];
  };
};

/**
 * Create a deterministic random number generator
 * @param seed Optional seed for reproducible results
 */
export const createRng = (seed?: string) => {
  return seedrandom(seed || 'default-seed');
};

/**
 * Generate values from a normal distribution
 * @param mean Mean of the distribution
 * @param std Standard deviation of the distribution
 * @param count Number of samples to generate
 * @param rng Optional random number generator
 */
export const generateNormalDistribution = (
  mean: number,
  std: number,
  count: number,
  rng = Math.random
): number[] => {
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    // Box-Muller transform to generate normal distribution
    const u1 = rng();
    const u2 = rng();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    result.push(z0 * std + mean);
  }
  return result;
};

/**
 * Generate values from a triangular distribution
 * @param min Minimum value
 * @param max Maximum value
 * @param mode Most likely value
 * @param count Number of samples to generate
 * @param rng Optional random number generator
 */
export const generateTriangularDistribution = (
  min: number,
  max: number,
  mode: number,
  count: number,
  rng = Math.random
): number[] => {
  const result: number[] = [];
  const range = max - min;
  const modePosition = (mode - min) / range;
  
  for (let i = 0; i < count; i++) {
    const r = rng();
    let value;
    
    if (r < modePosition) {
      value = min + Math.sqrt(r * range * (mode - min));
    } else {
      value = max - Math.sqrt((1 - r) * range * (max - mode));
    }
    
    result.push(value);
  }
  
  return result;
};

/**
 * Calculate histogram data for visualization
 * @param values Array of values to analyze
 * @param binCount Number of bins for the histogram
 */
export const calculateHistogram = (values: number[], binCount = 20): { bins: number[], frequencies: number[] } => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  // Ensure we have a reasonable range to avoid division by zero
  const range = max > min ? max - min : 1;
  const binWidth = range / binCount;
  
  const bins: number[] = [];
  const frequencies: number[] = Array(binCount).fill(0);
  
  // Create bin edges
  for (let i = 0; i <= binCount; i++) {
    bins.push(min + i * binWidth);
  }
  
  // Count frequencies
  for (const value of values) {
    // Handle edge case where value equals max
    if (value === max) {
      frequencies[binCount - 1]++;
    } else {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
      frequencies[binIndex]++;
    }
  }
  
  return { bins, frequencies };
};

/**
 * Calculate Value at Risk (VaR) from simulation results
 * @param values Array of simulated returns or values
 * @param confidenceLevel Confidence level (e.g., 0.95 for 95% VaR)
 */
export const calculateVaR = (values: number[], confidenceLevel: number): number => {
  // Sort values in ascending order for percentile calculation
  const sortedValues = [...values].sort((a, b) => a - b);
  const index = Math.floor(sortedValues.length * (1 - confidenceLevel));
  return -sortedValues[index];
};

/**
 * Calculate Expected Shortfall (Conditional VaR) from simulation results
 * @param values Array of simulated returns or values
 * @param confidenceLevel Confidence level (e.g., 0.95 for 95% ES)
 */
export const calculateExpectedShortfall = (values: number[], confidenceLevel: number): number => {
  const sortedValues = [...values].sort((a, b) => a - b);
  const varIndex = Math.floor(sortedValues.length * (1 - confidenceLevel));
  
  // Calculate average of values beyond VaR
  let sum = 0;
  for (let i = 0; i < varIndex; i++) {
    sum += sortedValues[i];
  }
  
  return -sum / varIndex;
};

/**
 * Calculate percentiles from the simulation results
 * @param values Array of simulated values
 * @param percentiles Array of percentiles to calculate (values between 0 and 1)
 */
export const calculatePercentiles = (
  values: number[], 
  percentiles: number[] = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]
): Record<string, number> => {
  const result: Record<string, number> = {};
  const sortedValues = [...values].sort((a, b) => a - b);
  
  for (const p of percentiles) {
    const index = Math.floor(p * (sortedValues.length - 1));
    result[`p${p * 100}`] = sortedValues[index];
  }
  
  return result;
};

/**
 * Calculate basic statistics for the simulation results
 * @param values Array of simulated values
 */
export const calculateStatistics = (values: number[]): SimulationResult => {
  const mean = jStat.mean(values);
  const median = jStat.median(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const std = jStat.stdev(values);
  const percentiles = calculatePercentiles(values);
  const VaR95 = calculateVaR(values, 0.95);
  const VaR99 = calculateVaR(values, 0.99);
  const expectedShortfall95 = calculateExpectedShortfall(values, 0.95);
  const histogram = calculateHistogram(values);
  
  return {
    values,
    mean,
    median,
    min,
    max,
    std,
    percentiles,
    VaR95,
    VaR99,
    expectedShortfall95,
    histogram
  };
};

/**
 * Run a Monte Carlo simulation for token holder cash flows
 * @param params Simulation parameters
 * @param numSimulations Number of simulations to run
 */
export const simulateTokenHolderReturns = (
  params: {
    pricePerToken: number;
    monthlyLeasePerToken: number;
    salvageValuePerToken: number;
    months: number;
    utilizationMean: number;
    utilizationStd: number;
    salvageValueMean: number;
    salvageValueStd: number;
    progressiveNOI: boolean;
    calculateReturnFn: (utilization: number, salvageRate: number) => number;
  },
  numSimulations: number = 1000
): SimulationResult => {
  const {
    pricePerToken,
    months,
    utilizationMean,
    utilizationStd,
    salvageValueMean,
    salvageValueStd,
    calculateReturnFn
  } = params;
  
  const rng = createRng('token-holder-returns');
  
  // Run simulations
  const returns: number[] = [];
  
  for (let i = 0; i < numSimulations; i++) {
    // Generate random utilization rate for this simulation
    const utilization = Math.max(0, Math.min(100, 
      generateNormalDistribution(utilizationMean, utilizationStd, 1, rng)[0]
    ));
    
    // Generate random salvage value for this simulation
    const salvageRate = Math.max(0, Math.min(100,
      generateNormalDistribution(salvageValueMean, salvageValueStd, 1, rng)[0]
    ));
    
    // Calculate return for this simulation using the provided function
    const simulatedReturn = calculateReturnFn(utilization, salvageRate);
    returns.push(simulatedReturn);
  }
  
  // Calculate statistics
  return calculateStatistics(returns);
};

/**
 * Calculate the probability of achieving a target return
 * @param simulationResult Result of a Monte Carlo simulation
 * @param targetReturn The target return to evaluate
 */
export const probabilityOfAchievingTarget = (
  simulationResult: SimulationResult,
  targetReturn: number
): number => {
  const { values } = simulationResult;
  const successCount = values.filter(val => val >= targetReturn).length;
  return successCount / values.length;
};

/**
 * Calculate the maximum drawdown from a series of values
 * @param values Series of cumulative values
 */
export const calculateMaxDrawdown = (values: number[]): number => {
  let maxDrawdown = 0;
  let peak = values[0];
  
  for (const value of values) {
    if (value > peak) {
      peak = value;
    }
    
    const drawdown = (peak - value) / peak;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  
  return maxDrawdown;
}; 