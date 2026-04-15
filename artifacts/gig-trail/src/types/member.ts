export type FeeType = "per_show" | "per_tour" | "none";

export type Member = {
  id: string;
  name: string;
  role?: string;
  expectedGigFee?: number;
  feeType?: FeeType;
};
