// Average cost per unit of the stock still on hand for a pooled inventory item.
//
// Sales remove their cost basis from totalCost and add their weight to
// soldWeight, but leave totalWeight alone. So the weight that totalCost still
// pays for is totalWeight − soldWeight (this includes weight out on memo, which
// is still ours). Dividing by totalWeight instead would understate the cost of
// every sale after the first one and overstate its profit.
export function avgCostPerUnit(item: { totalCost: number; totalWeight: number; soldWeight: number }): number {
  const onHand = item.totalWeight - item.soldWeight
  return onHand > 0 ? item.totalCost / onHand : 0
}
