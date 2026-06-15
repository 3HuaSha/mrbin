# Yard Dispatch System

An operations system for a busy yard running bin service, brick/material delivery, concrete orders, driver dispatch, and daily fleet supervision.

This is not a simple delivery tracker. The system is built around the messy parts of real dispatch work: trucks being re-routed, drivers waiting on site, bins being swapped or picked up later, material tickets needing proof, brick loads needing to fit before the truck leaves, and managers needing to know where time was lost.

## What It Handles

**Bin operations**

- Delivery, pickup, swap, dump, and manual yard steps
- Outstanding bin tracking, so the team can see which bins are still at customer locations
- Bin number reporting and photo proof from the driver app
- Order lifecycle view across delivery, pickup, dump tickets, and linked swap records

**Driver dispatch**

- Drag-and-drop assignment board for drivers and orders
- Manual steps for yard work, dump sites, loading, unloading, or special stops
- Driver PWA with route list, navigation, photo upload, ticket upload, and step completion
- Quick driver status buttons for waiting on customer, waiting for car move, lunch, and traffic

**Live operations map**

- Driver task list next to the map
- Samsara vehicle position integration
- Route preview and next-stop visibility
- ETA calculation using saved route snapshots
- Recent driver status shown beside the correct driver for quick dispatch awareness

**Driver supervision**

- Compares ETA, completion time, and expected service time
- Shows slow segments, late-risk stops, overdue tasks, and recurring slow locations
- Lets managers add a reason or note to a slow segment
- Provides a driver timeline combining completed stops and driver status events

**Brick and material delivery**

- Pallet-based load planning
- Truck capacity checks
- Pickup yard / factory support
- Delivery sequencing with time windows
- OR-Tools assisted scheduling for loaded trips, not just shortest-path routing

**Concrete and material inventory**

- Concrete order tracking
- Cement, sand, and HL6 / stone material order tracking
- Forecasting material demand from upcoming concrete volume
- Delivered material updates inventory planning

**Ticket OCR**

- Driver uploads dump or material tickets from the phone
- OCR extracts ticket number and weight when available
- Supports multiple ticket layouts used by dump sites and material suppliers

## Screens In The App

- Dispatch board
- Real-time fleet map
- Driver mobile PWA
- Orders and bin lifecycle
- Brick scheduling assistant
- Concrete management
- Driver supervision reports
- Fleet, users, and audit logs

## Tech

Built with React, TypeScript, TanStack Router/Query/Start, Supabase, Google Maps, Samsara, Google Vision OCR, Railway, and a Python OR-Tools helper for scheduling.

## Setup

Copy `.env.example` and fill in the required keys.

```bash
cp .env.example .env
```

For a stable demo, `VITE_DEMO_DATE` can be set to a fixed operating day. The example file uses `2026-06-02`.

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

This repository is a cleaned project version. Real customer data, private API keys, spreadsheet imports, and one-off operational SQL scripts should stay out of the repo.
