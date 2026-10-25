export interface BalanceBearingAccount {
  balance?: number
}

export interface AccountPosition {
  assets: number
  liabilities: number
  net: number
}

/** Splits account balances into gross assets and liabilities without losing the net position. */
export function summarizeAccountPosition(accounts: BalanceBearingAccount[]): AccountPosition {
  return accounts.reduce<AccountPosition>((position, account) => {
    const balance = account.balance ?? 0
    if (balance >= 0) position.assets += balance
    else position.liabilities += Math.abs(balance)
    position.net += balance
    return position
  }, { assets: 0, liabilities: 0, net: 0 })
}
