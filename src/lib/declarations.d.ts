declare module 'jstat' {
  // Basic statistics functions
  export function mean(arr: number[]): number;
  export function median(arr: number[]): number;
  export function stdev(arr: number[], flag?: boolean): number;
  export function variance(arr: number[], flag?: boolean): number;
  export function percentile(arr: number[], p: number): number;
  
  // Probability distributions
  export const normal: {
    pdf(x: number, mean: number, std: number): number;
    cdf(x: number, mean: number, std: number): number;
    inv(p: number, mean: number, std: number): number;
    sample(mean: number, std: number): number;
  };
  
  // Statistical tests
  export function ttest(sample: number[], mu: number): number;
}

declare module 'seedrandom' {
  export default function seedrandom(seed?: string): () => number;
} 