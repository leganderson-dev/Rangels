# Rangels classification redesign blueprint

Status: **design only**. This document does not authorize or perform application, schema, or ledger changes.

## Objective

Replace the legacy category tree—which mixes spending purpose, financial context, transaction state, people, projects, and tax treatment—with independent dimensions that can be classified and reported correctly.

## Vocabulary

- **Account:** where money lives.
- **Transaction type:** income, expense, or transfer.
- **Merchant:** who the transaction involved.
- **Category:** what the money was for.
- **Context:** the financial world involved: Personal, Property, or Business.
- **Bucket:** the role of personal consumption: Daily Expenses, Splurge, or Smile.
- **Account purpose:** a helpful default for money held in an account, not an absolute classification.
- **Goal:** a target financial position such as Mojo coverage.
- **Allocation strategy:** where surplus money should go, such as Fire Extinguisher.
- **Structured attributes:** reimbursement and tax treatment.
- **Tags:** ad-hoc labels only. Tags must not replace the dimensions above.

## Classification flow

```text
Raw bank description
        ↓
Transaction type
        ↓
Merchant
        ↓
Context
        ↓
Category
        ↓
Default personal bucket (when Context = Personal)
        ↓
Reimbursement / tax attributes
```

Every stage has its own confidence. Merchant confidence must not be reused as category or context confidence.

## Contexts demonstrated by the existing data

- Personal
- Business — ASA
- Property — Currumundi
- Property — Everton Park
- Property — Toogoom
- Review required (temporary migration state only)

## Personal buckets

- Daily Expenses
- Splurge
- Smile

The following are deliberately not personal spending buckets:

- **Mojo:** reserve/goal funded by account holdings.
- **Fire Extinguisher:** allocation strategy with a changing destination.
- **Grow:** investment/wealth destination.
- **Property and business activity:** excluded from personal Barefoot percentages.

## Proposed reusable category taxonomy

### Income

- Salary
- Additional earnings
- Rental income
- Business income
- Interest
- Refund / rebate
- Other income

### Housing and utilities

- Mortgage payment
- Rent
- Council rates
- Electricity
- Gas
- Water
- Internet
- Mobile phone
- Home insurance
- Cleaning
- Repairs and maintenance
- Furniture and appliances

### Food and dining

- Groceries
- Restaurants
- Cafes
- Work meals
- Tuckshop meals
- Other food

### Transport

- Fuel
- Public transport
- Rideshare and taxi
- Micromobility
- Parking
- Tolls
- Registration
- Vehicle insurance
- Vehicle maintenance
- Fines
- Vehicle purchase

### Health

- Medical care
- Pharmacy
- Health insurance

### Children

- Activities
- Childcare
- School care
- School fees
- School supplies
- Books and learning
- Allowance
- Clothing
- Entertainment
- Toys
- Tuckshop meals

### Lifestyle

- Alcohol
- Clothing
- Digital purchases
- Entertainment
- Gifts
- Hobbies and collectibles
- Personal care
- Subscriptions
- Travel
- Donations
- Electronics and gadgets
- Other lifestyle

### Pets

- Food
- Veterinary care
- Insurance
- Other

### Financial

- Bank fees
- Insurance excess
- Debt repayment
- Tax payment

### Property-only categories

- Rental income
- Mortgage payment
- Land loan payment
- Pool loan payment
- Council rates
- Insurance
- Water
- Repairs and maintenance
- Garden and landscaping
- Pool maintenance
- Furniture and appliances
- Capital improvements
- Acquisition / deposit
- Other property cost

### Business-only categories

- General operating costs
- Program / team costs
- Wages and salaries
- IT
- Licences
- Marketing
- Awards and trophies
- Staff costs
- Training equipment
- Uniforms
- Business refund

## Legacy-family migration map

| Legacy family | New category treatment | Context | Bucket | Additional treatment |
|---|---|---|---|---|
| `Food:*` | Food and dining categories | Personal | Groceries/tuckshop: Daily; cafes/restaurants/work meals: Splurge | None |
| `Entertainment & Recreation:*` | Lifestyle categories | Personal | Mostly Splurge; gifts/travel: Smile | Christmas becomes an event dimension |
| `Contas diversas:*` | Utilities, children, health, debt, and subscriptions | Personal | Category default | Phone owner becomes Person; tax requires tax treatment |
| `Transportation:*` | Reusable transport categories | Personal | Mostly Daily; fines/micromobility: Splurge; vehicle purchase: Smile | None |
| `Kids:*` | Reusable children categories | Personal | Category default | Hanna/Petra become Person; savings should be transfers |
| `Pet:*` | Reusable pet categories | Personal | Daily Expenses | None |
| `Bank:*` | Financial categories or income | Personal | Usually Daily or none | Fee rebate becomes refund/rebate |
| `Besteira:*` | Hobbies, gadgets, or other lifestyle | Personal | Splurge | Direct `Besteira` requires review |
| `House - Currumundi:*` | Reusable property categories | Property — Currumundi | None | Property tax treatment |
| `House - EvertonPark:*` | Reusable property categories | Property — Everton Park | None | Construction children become Project under Capital Improvements |
| `House - Toogoom:*` | Reusable property categories | Property — Toogoom | None | Property tax treatment |
| `ASA:*` | Reusable business categories | Business — ASA | None | Tax-prefixed paths likely deductible; program labels require review |
| `Salario*` | Salary / additional earnings | Personal | None | Income |
| `PgtoCartaodeCredito` | No spending category | Derived from source/destination accounts | None | Transfer |
| `Transfers` | No spending category | Derived from source/destination accounts | None | Transfer |
| `TaxDeductable:Donation` | Donations | Personal | Smile | Tax treatment: deductible |
| `ToBeRefunded` | Recover original expense category | Usually Personal | Derived from recovered category | Reimbursement status: expected |
| `Reibursment` | Refund/reimbursement linked to original expense | Usually Personal | None | Reimbursement status: received |
| `?????` | Unclassified | Review required | None | Human or merchant-rule review |
| `DEBIT` | Unclassified import artefact | Review required | None | Reclassify from merchant and amount direction |
| `Sydney` | Not yet known | Review required | None | Likely context, location, or project |
| `Variados*` | Redistribute or leave unclassified temporarily | Personal | Derived after review | Merchant-level review |
| `Gov:Divida` | Debt repayment | Personal | None | Identify liability and principal/interest treatment |
| `Gov:Tax` / `Tax` | Tax payment | Context must be established | None | Tax treatment review |
| `Airbnb` | Travel accommodation, property cost, or rental income | Review required | Unknown | Determine direction and context |

## High-impact path decisions

These paths should be reviewed before any migration because they represent substantial history or ambiguous semantics:

1. `ToBeRefunded` — 724 transactions: recover original categories from merchant/history.
2. `Reibursment` — 413 transactions: link receipts to prior expenses where possible.
3. `ASA:Academy` — 415 transactions: confirm whether Academy is a program, team, customer, or cost type.
4. `Contas diversas:Subscriptions` — 473 transactions: decide default bucket, probably Splurge.
5. `Entertainment & Recreation:Trips/Holidays` — 456 transactions: proposed Smile.
6. `Gov:Divida` — 184 transactions: identify the liability and accounting treatment.
7. `?????` — 149 transactions: merchant-assisted classification.
8. `DEBIT` — 53 transactions: import artefact requiring transaction-level recovery.
9. `Sydney` — 28 transactions: determine whether this is location, context, or project.
10. Property mortgage/loan paths: determine whether source data can split principal, interest, and fees.

## Concrete examples

| Legacy path | Category | Context | Bucket | Other dimension |
|---|---|---|---|---|
| `Food:Supermarket` | Groceries | Personal | Daily Expenses | — |
| `Food:Restaurante` | Restaurants | Personal | Splurge | — |
| `Entertainment & Recreation:Trips/Holidays` | Travel | Personal | Smile | — |
| `Kids:Allowance:Hanna` | Allowance | Personal | Daily Expenses | Person: Hanna |
| `Kids:Savings:Petra` | None | Personal | None | Transfer; Person: Petra |
| `House - Currumundi:Bunnings/Maintenance` | Repairs and maintenance | Property — Currumundi | None | Property tax treatment |
| `House - EvertonPark:Construction Extras:Solar` | Capital improvements | Property — Everton Park | None | Project: Solar |
| `ASA:Tax:Marketing` | Marketing | Business — ASA | None | Likely tax deductible |
| `TaxDeductable:Donation` | Donations | Personal | Smile | Tax deductible |
| `ToBeRefunded` | Original category to recover | Original context | Derived | Reimbursement expected |

## Migration rules

1. Add new dimensions alongside the legacy category; do not overwrite historical classifications initially.
2. Preserve transaction amounts, accounts, dates, transfer links, and external IDs exactly.
3. Apply deterministic mappings first.
4. Review ambiguous paths using merchant history and transaction samples.
5. Reconcile totals by account, month, type, property, and business before switching reports.
6. Keep the legacy category path available until every validation passes.
7. Roll back by removing new assignments, never by rewriting ledger history.

## Decisions still required

- Whether subscriptions default to Splurge or Daily Expenses.
- Whether ordinary clothing defaults to Daily Expenses or Splurge.
- Whether gifts and children’s birthdays default to Smile.
- Correct identity of ASA program-like labels: Academy, Grange Thistle, Mitchie, and NCC.
- Meaning of Sydney and direct catch-all/root entries.
- Liability and principal/interest treatment for MG loan, Gov:Divida, mortgages, land loan, and pool loan.
- Whether property capital improvements require a dedicated capital/revenue treatment field.
- How to recover original categories for `ToBeRefunded` and link received reimbursements.

## Next step

Review the high-impact decisions above in descending transaction-count order. Once confirmed, produce a row-level mapping dataset and only then design the additive schema migration.
