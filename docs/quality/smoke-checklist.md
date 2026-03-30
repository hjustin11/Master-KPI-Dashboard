# Smoke Test Checklist

Run this checklist after significant backend or integration changes.

## Preconditions

- Environment variables configured.
- App starts locally (`npm run dev`).
- Valid test account exists.

## Core Flows

1. **Authentication**
   - Open `/login`, authenticate, and confirm redirect to dashboard.
   - Confirm unauthorized user is redirected from protected routes.

2. **Dashboard Navigation**
   - Open sidebar entries for major domains (Amazon, Analytics, Xentral).
   - Confirm each page renders without runtime errors.

3. **Marketplace Orders**
   - Open at least two marketplace order pages.
   - Change `Von/Bis` dates and confirm data refreshes automatically.
   - Confirm loading and error states behave correctly.

4. **Analytics: Marketplaces**
   - Open `Analytics -> Marktplätze`.
   - Open detail popup, verify article list and popup date filter behavior.
   - Confirm previous-period indicators are shown where available.

5. **Xentral Orders**
   - Open `Xentral -> Aufträge`.
   - Verify data load, filtering, and order link behavior.

6. **API Stability Spot Check**
   - Check browser network panel for 5xx spikes on primary endpoints.
   - Confirm no repeated failing polling calls.

## Technical Gates

- `npm run lint`
- `npm run typecheck`
- `npm run build`
