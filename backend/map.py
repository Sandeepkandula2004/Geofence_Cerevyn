import json
from pathlib import Path
import folium
import h3
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import unary_union

def extract_feature_by_pincode(fc: dict, pincode: str) -> dict:
    for feature in fc.get("features", []):
        props = feature.get("properties", {})
        if str(props.get("Pincode")) == str(pincode):
            return feature
    return {}

def extract_features_by_pincodes(fc: dict, pincodes: list[str]) -> list[dict]:
    """Extract multiple features by pincode list."""
    features = []
    for feature in fc.get("features", []):
        props = feature.get("properties", {})
        if str(props.get("Pincode")) in pincodes:
            features.append(feature)
    return features

def load_geojson(path: str) -> dict:
    geo_path = Path(path)
    if not geo_path.exists():
        raise FileNotFoundError(f"GeoJSON file not found: {geo_path}")
    with geo_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)

def _shapely_to_h3_polygon(geom):
    """Convert Shapely Polygon to h3.LatLngPoly."""
    if isinstance(geom, MultiPolygon):
        # For MultiPolygon, use the largest polygon
        geom = max(geom.geoms, key=lambda p: p.area)
    
    if not isinstance(geom, Polygon):
        raise ValueError(f"Expected Polygon or MultiPolygon, got {type(geom)}")
    
    # Get exterior coordinates (Shapely uses lon, lat order)
    exterior = geom.exterior.coords[:-1]  # Remove last duplicate point
    # Convert to (lat, lon) tuples for h3
    outer = [(lat, lon) for lon, lat in exterior]
    
    return h3.LatLngPoly(outer)

def _geometry_to_cells(geom, resolution: int) -> set:
    """Convert Shapely geometry to H3 cells, handling both Polygon and MultiPolygon."""
    cells = set()
    
    if isinstance(geom, Polygon):
        # Single polygon
        h3_poly = _shapely_to_h3_polygon(geom)
        cells.update(h3.h3shape_to_cells(h3_poly, resolution))
    elif isinstance(geom, MultiPolygon):
        # Multiple polygons - process each separately
        for poly in geom.geoms:
            h3_poly = _shapely_to_h3_polygon(poly)
            cells.update(h3.h3shape_to_cells(h3_poly, resolution))
    else:
        raise ValueError(f"Unsupported geometry type: {type(geom)}")
    
    return cells

def _latlng_to_cell(lat: float, lng: float, resolution: int):
    """Convert a lat/lng to an H3 cell index."""
    return h3.latlng_to_cell(lat, lng, resolution)

def _cell_boundary(cell):
    """Get boundary coordinates for an H3 cell."""
    boundary = h3.cell_to_boundary(cell)
    return boundary

def merge_geometries(features: list[dict]) -> dict:
    """Merge multiple geometries into a single unified geometry (removes internal boundaries)."""
    if not features:
        raise ValueError("No features to merge")
    
    # Convert all features to Shapely geometries
    geometries = [shape(f["geometry"]) for f in features]
    
    # Use unary_union to merge and dissolve internal boundaries
    merged = unary_union(geometries)
    
    # Convert back to GeoJSON-like dict
    return {
        "type": "Feature",
        "properties": {
            "pincodes": [str(f["properties"].get("Pincode")) for f in features],
            "count": len(features)
        },
        "geometry": merged.__geo_interface__
    }

def visualize_pincode_h3(
    geojson_fc: dict,
    pincodes: str | list[str],
    h3_resolution: int,
    output_path: str = "pincode_h3.html",
    user_lat: float | None = None,
    user_lng: float | None = None,
    merge_boundaries: bool = True,
):
    """
    Visualize one or more pincodes with H3 hexagons.
    
    Args:
        geojson_fc: GeoJSON FeatureCollection
        pincodes: Single pincode string or list of pincodes
        h3_resolution: H3 resolution level (8-12 recommended, 12 is very detailed)
        output_path: Output HTML file path
        user_lat: Optional user latitude
        user_lng: Optional user longitude
        merge_boundaries: If True, merge multiple pincodes into single boundary
    """
    # Handle single pincode or list
    if isinstance(pincodes, str):
        pincodes = [pincodes]
    
    # Extract features
    if len(pincodes) == 1:
        feature = extract_feature_by_pincode(geojson_fc, pincodes[0])
        if not feature:
            raise ValueError(f"Pincode {pincodes[0]} not found")
        features = [feature]
    else:
        features = extract_features_by_pincodes(geojson_fc, pincodes)
        if not features:
            raise ValueError(f"No features found for pincodes: {pincodes}")
        if len(features) != len(pincodes):
            found = [str(f["properties"].get("Pincode")) for f in features]
            missing = set(pincodes) - set(found)
            print(f"Warning: Some pincodes not found: {missing}")
    
    print(f"Processing {len(features)} pincode(s): {', '.join(pincodes)}")
    
    # Merge geometries if requested
    if merge_boundaries and len(features) > 1:
        print("Merging boundaries...")
        merged_feature = merge_geometries(features)
        display_feature = merged_feature
        geometry = shape(merged_feature["geometry"])
        print(f"Merged {len(features)} pincodes into single boundary")
    else:
        display_feature = features[0]
        geometry = shape(display_feature["geometry"])
    
    # Get all H3 cells from all features
    print(f"Generating H3 hexagons at resolution {h3_resolution}...")
    all_hexagons = set()
    
    if merge_boundaries and len(features) > 1:
        # Process merged geometry
        all_hexagons = _geometry_to_cells(geometry, h3_resolution)
    else:
        # Process each feature separately
        for i, feature in enumerate(features):
            print(f"  Processing pincode {i+1}/{len(features)}...")
            geom = shape(feature["geometry"])
            cells = _geometry_to_cells(geom, h3_resolution)
            all_hexagons.update(cells)
    
    print(f"Generated {len(all_hexagons)} H3 hexagons")
    
    # Calculate centroid for map center
    centroid = geometry.centroid
    
    m = folium.Map(
        location=[centroid.y, centroid.x],
        zoom_start=12,
        tiles="cartodbpositron"
    )
    
    # Add boundary outline
    if merge_boundaries and len(features) > 1:
        # Show merged boundary
        folium.GeoJson(
            display_feature,
            name="Merged Boundary",
            style_function=lambda _: {
                "fillColor": "#4f46e5",
                "color": "#4f46e5",
                "weight": 2,
                "fillOpacity": 0.15,
            },
            tooltip=f"Pincodes: {', '.join(pincodes)}",
        ).add_to(m)
    else:
        # Show individual boundaries
        for i, feature in enumerate(features):
            pincode = feature["properties"].get("Pincode")
            folium.GeoJson(
                feature,
                name=f"Pincode {pincode}",
                style_function=lambda _, idx=i: {
                    "fillColor": ["#4f46e5", "#7c3aed", "#a855f7", "#c084fc"][idx % 4],
                    "color": ["#4f46e5", "#7c3aed", "#a855f7", "#c084fc"][idx % 4],
                    "weight": 2,
                    "fillOpacity": 0.15,
                },
                tooltip=f"Pincode {pincode}",
            ).add_to(m)
    
    # Add H3 cells
    print("Adding hexagons to map...")
    for h in all_hexagons:
        boundary = _cell_boundary(h)
        folium.Polygon(
            locations=boundary,
            color="#0ea5e9",
            weight=1,
            opacity=0.8,
            fill=True,
            fill_opacity=0.25,
            tooltip=h,
        ).add_to(m)

    # Optional: user location check
    if user_lat is not None and user_lng is not None:
        user_cell = _latlng_to_cell(user_lat, user_lng, h3_resolution)
        status = "inside" if user_cell in all_hexagons else "outside"
        print(f"User cell: {user_cell} -> {status.upper()}")
        folium.Marker(
            location=[user_lat, user_lng],
            tooltip=f"User ({status})",
            popup=f"H3 cell: {user_cell}\nStatus: {status}",
            icon=folium.Icon(color="green" if status == "inside" else "red"),
        ).add_to(m)
    
    folium.LayerControl().add_to(m)
    m.save(output_path)
    print(f"✓ Saved map to {output_path}")

if __name__ == "__main__":
    geojson_data = load_geojson("../All_India_pincode_Boundary-19312.geojson")
    
    # Example 1: Single pincode
    visualize_pincode_h3(
        geojson_fc=geojson_data,
        pincodes="570029",
        h3_resolution=10,  # Start with 10, not 12!
        output_path="pincode_570029.html",
        user_lat=12.364804547891925,
        user_lng=76.60488544067712,
    )
    
    # Example 2: Multiple pincodes with merged boundary
    # visualize_pincode_h3(
    #     geojson_fc=geojson_data,
    #     pincodes=["570027", "570028", "570029"],
    #     h3_resolution=10,  # Use 10 instead of 12 for faster processing
    #     output_path="pincode_merged.html",
    #     user_lat=12.364804547891925,
    #     user_lng=76.60488544067712,
    #     merge_boundaries=True,
    # )