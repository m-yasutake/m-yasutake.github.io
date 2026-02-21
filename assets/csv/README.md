# CSV Point Import Example

This directory contains example CSV files for importing GPS points into the Roots map.

## CSV Format Requirements

Your CSV file must have:
- **latitude** (or lat): Required - the latitude coordinate
- **longitude** (or lon/lng): Required - the longitude coordinate
- **name**: Optional - name of the point (defaults to "Point N" if not provided)
- **url** (or link/page): Optional - URL linking to more information about the point

All other columns will be stored as metadata and displayed in the info modal.

### Type Column (for custom map icons)

If your CSV includes a **Type** column, each point will get a distinct icon on the map based on its type. Supported types:

| Type | Icon | Color |
|------|------|-------|
| Onsen | Hot spring (steam) | Red |
| Campsite | Tent/triangle | Green |
| Roadside Station | Building | Blue |
| Must See | Star | Yellow |
| Hotel | Building | Purple |
| *(other/empty)* | Circle dot | Grey |

## Example CSV

```csv
name,latitude,longitude,url,Type,rating,notes
Hakone Yuryo,35.2328,139.0573,https://example.com/hakone,Onsen,4.5,Beautiful mountain onsen
Kusatsu Onsen,36.6228,138.5986,https://example.com/kusatsu,Onsen,5.0,Famous hot spring town
Fumotoppara,35.3845,138.5753,https://example.com/fumotoppara,Campsite,4.7,Iconic campsite with Mt Fuji views
```

## Features

- **Quoted Values**: Values containing commas can be quoted: `"Point A, with comma"`
- **Escaped Quotes**: Use double quotes to escape: `"He said ""hello"""`
- **Metadata**: All columns except name, lat, lon, and url are stored as metadata
- **Flexible Headers**: Latitude can be `latitude` or `lat`, longitude can be `longitude`, `lon`, or `lng`

## Usage

1. **Local Upload**: Click "+ Add CSV Points" button on the Roots page and select your CSV file
2. **Firebase Upload**: Sign in as admin and drag & drop your CSV file into the upload area
3. **View Points**: Click the info button (ℹ) next to the point group to view metadata
4. **Toggle Visibility**: Use the checkbox to show/hide all points from a CSV file
