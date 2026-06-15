# Dispatch Operations System

A web-based dispatch and driver operations system built for a mixed logistics yard: bin delivery and pickup, brick/material delivery, concrete orders, driver task execution, map tracking, ETA monitoring, and ticket capture.

The project is designed around real dispatch work rather than a generic delivery app. A dispatcher needs to know what each driver is doing, what is loaded, which stops are late, where bins are sitting, and which orders still need attention.

## Main Features

- Multi-business dispatch for garbage bins, brick/material delivery, and concrete orders
- Drag-and-drop dispatch board for assigning orders and manual steps to drivers
- Real-time fleet map with driver task lists, Samsara vehicle positions, and route previews
- Driver PWA for mobile task execution, photo upload, scale ticket upload, OCR, and step completion
- ETA calculation and saved ETA snapshots for comparing planned vs actual execution
- Driver supervision view showing slow segments, late-risk tasks, status events, and notes
- One-tap driver status logging: waiting for customer, waiting for car move, lunch, traffic
- Bin lifecycle tracking across delivery, swap, pickup, dump, and outstanding bin records
- Brick dispatch assistant with vehicle capacity, pallet count, pickup yard, delivery sequence, and route constraints
- Concrete order and material inventory management with demand forecasting
- OCR support for dump / material tickets, including ticket number and weight extraction
- Supabase-backed database, storage, auth, migrations, and realtime updates

## Why This Exists

Small fleet operations often run on spreadsheets, text messages, phone calls, and driver memory. That works for a while, but it becomes hard to answer simple questions:

- Which driver is currently slow, and where did the time go?
- Did the driver arrive late, wait on site, or spend too long unloading?
- Which bins are still outside at customer locations?
- Which brick orders fit on a truck before it leaves the yard?
- Which material tickets and scale weights are missing?
- What changed after dispatch was already sent to drivers?

This system pulls those workflows into one place so dispatchers can plan, monitor, adjust, and review the day without jumping between tools.

## Core Workflows

### Dispatch

Dispatchers can create and assign orders, add manual steps, reorder driver routes, and sync changes to the driver app. The dispatch board supports both normal customer stops and yard/factory/manual work such as loading, dumping, pickup, or returning to a depot.

### Driver App

Drivers use a mobile-friendly PWA to see today's route, navigate to the next stop, upload photos, scan tickets, report bin numbers, and complete each task in order. Quick status buttons let drivers record common delays without typing.

### Fleet Map

The map view combines assigned work, vehicle positions, ETA snapshots, and driver status. Dispatchers can hover a driver to see route order, calculate ETA, and quickly spot whether a driver is waiting, on lunch, stuck in traffic, or falling behind.

### Driver Supervision

The supervision page focuses on execution quality. It compares ETA and completed time, highlights slow points, ranks drivers and locations by delay, and lets managers add reasons or notes for slow segments.

### Brick / Material Scheduling

Brick delivery is handled as loaded-trip planning, not simple point-to-point delivery. The assistant considers pallet count, vehicle capacity, pickup yard, delivery order, time windows, and whether orders need to be left for another trip.

### Concrete Management

Concrete orders and material orders are tracked separately, with demand estimates for cement, sand, and stone/HL6 based on upcoming concrete volume and delivered material inventory.

## Tech Stack

- React / TypeScript
- TanStack Router / Query / Start
- Supabase database, auth, storage, realtime, migrations
- Google Maps / Routes Matrix
- Samsara vehicle data
- Railway deployment
- Google Vision OCR
- Python OR-Tools helper for route optimization

## Environment

Copy `.env.example` and fill in the required keys:

```bash
cp .env.example .env
```

Important variables include Supabase, Google Maps, Google Vision, Samsara, and optional AI import settings.

## Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm start
```

## Notes

This repository is intended as a cleaned project version. Real customer data, private API keys, imported spreadsheet files, and one-off operational SQL scripts should not be committed.
