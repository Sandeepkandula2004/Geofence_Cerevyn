import requests
import folium

def generate_boundary_map(area_name):
    # 1. SEARCH API (Nominatim)
    # We use 'q' for a free-text search (Name + City)
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        'q': area_name, 
        'polygon_geojson': 1, # This requests the full shape
        'format': 'json',
        'limit': 1
    }
    headers = {'User-Agent': 'MyStudentProject_GeoFence/1.0'}

    print(f"🔍 Searching for boundary of: '{area_name}'...")
    response = requests.get(url, params=params, headers=headers)
    data = response.json()

    if not data:
        print("❌ Location not found.")
        return

    result = data[0]
    geojson_data = result['geojson']
    display_name = result['display_name']
    
    # Check if we got a Polygon (good) or just a Point (bad)
    geom_type = geojson_data['type']
    print(f"✅ Found: {display_name}")
    print(f"📐 Geometry Type: {geom_type}")

    if geom_type == 'Point':
        print("⚠️ Warning: This location only has a center point, not a boundary.")

    # 2. EXTRACT CENTER FOR MAP
    # Nominatim gives 'lat' and 'lon' of the center
    center_lat = float(result['lat'])
    center_lon = float(result['lon'])

    # 3. BUILD FOLIUM MAP
    m = folium.Map(location=[center_lat, center_lon], zoom_start=14)

    # 4. ADD THE POLYGON LAYER
    # folium.GeoJson takes the raw GeoJSON dictionary directly!
    folium.GeoJson(
        geojson_data,
        name='geojson',
        style_function=lambda x: {
            'fillColor': 'blue',
            'color': 'blue',
            'weight': 2,
            'fillOpacity': 0.2
        },
        tooltip=area_name
    ).add_to(m)

    # Add a marker at the center
    folium.Marker(
        [center_lat, center_lon],
        popup=display_name,
        icon=folium.Icon(color="red", icon="info-sign")
    ).add_to(m)

    # 5. SAVE
    filename = f"map_{area_name.replace(' ', '_').replace(',', '')}.html"
    m.save(filename)
    print(f"🎉 Map saved as: {filename}")
   
    # 6. PRINT POINTS (Optional - to show you the data exists)
    # If it's a Polygon, coordinates are in geojson_data['coordinates'][0]
    if geom_type == 'Polygon':
        points = geojson_data['coordinates'][0]
        print(f"📊 This boundary is defined by {len(points)} points.")
        print(f"   Sample: {points[:2]}...")

# --- RUN IT ---
# Try specific area names that are likely to have boundaries
# "Kondapur, Hyderabad" or "Gachibowli, Hyderabad"
generate_boundary_map("Kondapur, Hyderabad")