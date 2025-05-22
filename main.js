let map, geojsonLayer, importData = {};
let svgLayer = null;
let selectedCountries = new Set();


document.querySelector('.hero-scroll').addEventListener('click', function (e) {
  e.preventDefault();
  document.getElementById('section-map').scrollIntoView({ behavior: 'smooth' });
});

const initialView = {
  center: [20, 0],
  zoom: 2
};

const customCenters = {
  "United States of America": [40.48994, -101.60156],
  "China": [34.05953, 102.30469],
  "Russia": [65.39982, 101.25000],
  "Canada": [60.44651, -114.25781],
  "Norway": [78.78649, 18.28125]
};


document.addEventListener("DOMContentLoaded", function () {
  const navbar = document.querySelector(".main-navbar");
  let lastScrollTop = 0;
  let ticking = false;

  window.addEventListener("scroll", function () {
    if (!ticking) {
      window.requestAnimationFrame(function () {
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

        if (Math.abs(currentScroll - lastScrollTop) > 10) {
          if (currentScroll > lastScrollTop) {
            navbar.classList.add("hide-navbar");
          } else {
            navbar.classList.remove("hide-navbar");
          }
          lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
        }

        ticking = false;
      });

      ticking = true;
    }
  });
});



function getColor(d) {
  return d > 100e8 ? '#08306b' :
    d > 10e8 ? '#2171b5' :
      d > 1e8 ? '#4292c6' :
        d > 5e7 ? '#6baed6' :
          d > 1e7 ? '#9ecae1' :
            d > 1e6 ? '#c6dbef' :
              '#deebf7';
}

function style(feature) {
  const name = feature.properties.name;
  const value = importData[name] || 0;
  return {
    fillColor: getColor(value),
    weight: 1,
    opacity: 1,
    color: 'white',
    dashArray: '3',
    fillOpacity: 0.85
  };
}
const resetViewControl = L.control({ position: 'topleft' });

resetViewControl.onAdd = function (map) {
  const btn = L.DomUtil.create('button', 'reset-view-btn');
  btn.innerHTML = '↺';
  btn.title = 'Return to initial zoom and position';
  btn.style.padding = '6px 10px';
  btn.style.background = 'white';
  btn.style.color = 'black';
  btn.style.border = 'none';
  btn.style.borderRadius = '4px';
  btn.style.cursor = 'pointer';
  btn.style.fontSize = '16px';

  L.DomEvent.disableClickPropagation(btn);

  btn.addEventListener('click', () => {
    map.setView(initialView.center, initialView.zoom);
  });

  return btn;
};


function onEachFeature(feature, layer) {
  const name = feature.properties.name;
  const value = importData[name] || 0;

  layer.bindTooltip(
    `<b>${name}</b><br>Total import value: $${value.toLocaleString()}`,
    { sticky: true }
  );


  layer.on({
    mouseover: function (e) {
      const l = e.target;
      l.setStyle({
        weight: 3,
        color: 'white',
        dashArray: '',
        fillOpacity: 0.9
      });


      if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        l.bringToFront();
      }
    },
    mouseout: function (e) {

      if (!selectedCountries.has(name)) {
        geojsonLayer.resetStyle(e.target);
      }
    },
    click: function () {
      if (selectedCountries.has(name)) {
        selectedCountries.delete(name);
        removeCountryArrows(name);
        layer.setStyle({ weight: 1, color: 'white' });
      } else {
        selectedCountries.add(name);
        drawTop3Connections(name);
        layer.setStyle({ weight: 3, color: '#e67e22' });
      }
      updateCountryPanel();
    }
  });
}

const arrowsCache = {};

function renderArrows(countryName, arrows) {
  const svgLayer = ensureSvgLayer();
  const svgContainer = d3.select(svgLayer._container).select('svg');
  const safeId = safeCountryId(countryName);
  svgContainer.select(`#${safeId}`).remove();

  function latLngToPoint(lat, lng) {
    const pt = map.latLngToLayerPoint([lat, lng]);
    return [pt.x, pt.y];
  }

  let svgPaths = '', svgDefs = '';
  arrows.forEach((arrow, idx) => {
    const fromP = latLngToPoint(arrow.to[0], arrow.to[1]);
    const toP = latLngToPoint(arrow.from[0], arrow.from[1]);
    const controlP = latLngToPoint(arrow.control[0], arrow.control[1]);

    const totalLen = Math.hypot(toP[0] - fromP[0], toP[1] - fromP[1]);
    const tailWidth = 2, headWidth = 16, headLen = 25, steps = 80;

    function lerp(a, b, t) { return a + (b - a) * t; }
    function bezier(t, p0, p1, p2) {
      return [
        lerp(lerp(p0[0], p1[0], t), lerp(p1[0], p2[0], t), t),
        lerp(lerp(p0[1], p1[1], t), lerp(p1[1], p2[1], t), t)
      ];
    }

    let centerLine = [];
    for (let i = 0; i <= steps; i++) {
      centerLine.push(bezier(i / steps, fromP, controlP, toP));
    }

    let leftPts = [], rightPts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let width = tailWidth + (headWidth - tailWidth) * Math.pow(t, 1.7);
      if (t > 1 - headLen / totalLen) {
        width = headWidth * (1 - Math.pow((t - (1 - headLen / totalLen)) / (headLen / totalLen), 1.5));
      }
      const p0 = centerLine[Math.max(i - 1, 0)];
      const p1 = centerLine[Math.min(i + 1, steps)];
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      leftPts.push([centerLine[i][0] - nx * width / 2, centerLine[i][1] - ny * width / 2]);
      rightPts.push([centerLine[i][0] + nx * width / 2, centerLine[i][1] + ny * width / 2]);
    }

    const points = leftPts.concat(rightPts.reverse()).map(p => p.join(',')).join(' ');
    const gradientId = `arrow-anim-gradient-${safeId}-${idx}`;
    svgDefs += `<linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="orange" />
                  <stop offset="50%" stop-color="#fffbe7">
                    <animate attributeName="offset" values="0.4;0.7;0.4" dur="1.2s" repeatCount="indefinite"/>
                  </stop>
                  <stop offset="100%" stop-color="orange" />
                </linearGradient>`;
    svgPaths += `<polygon points="${points}" fill="url(#${gradientId})" fill-opacity="0.92"
                    stroke="orange" stroke-width="2" stroke-opacity="0.7"/>`;
  });
  svgContainer.select('defs').html(svgContainer.select('defs').html() + svgDefs);

  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("id", safeId);
  group.innerHTML = svgPaths;
  svgContainer.node().appendChild(group);
}


function updateCountryPanel() {
  const ul = document.getElementById('selected-countries');
  ul.innerHTML = '';
  selectedCountries.forEach(name => {
    const li = document.createElement('li');
    li.textContent = name;
    const btn = document.createElement('button');
    btn.textContent = '⤬';
    btn.onclick = function () {
      selectedCountries.delete(name);
      ul.removeChild(li);
      geojsonLayer.eachLayer(layer => {
        if (layer.feature.properties.name === name) {
          layer.setStyle({ weight: 1, color: 'white' });
        }
      });
      removeCountryArrows(name);
    };
    li.appendChild(btn);
    ul.appendChild(li);
  });
}


function ensureSvgLayer() {
  if (!window.svgLayer) {
    window.svgLayer = L.svg({ pane: "overlayPane" });
    map.addLayer(window.svgLayer);
  }

  const container = d3.select(window.svgLayer._container);

  if (container.select("svg").empty()) {
    container.html(`<svg width="${map.getSize().x}" height="${map.getSize().y}" style="position:absolute;top:0;left:0;pointer-events:none;"><defs></defs></svg>`);
  }

  return window.svgLayer;
}


function loadMap() {
  map = L.map('map').setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  fetch("src/data/custom.geojson")
    .then(res => res.json())
    .then(geo => {
      geojsonLayer = L.geoJSON(geo, {
        style: style,
        onEachFeature: onEachFeature
      }).addTo(map);

      Papa.parse("src/data/tradedata/total_imports.csv", {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
          results.data.forEach(row => {
            importData[row.importer] = parseFloat(row.total_import);
          });

          geojsonLayer.setStyle(style);

          geojsonLayer.eachLayer(layer => {
            const name = layer.feature.properties.name;
            const value = importData[name] || 0;
            layer.bindTooltip(
              `<b>${name}</b><br>Total import value: $${value.toLocaleString()}`,
              { sticky: true }
            );
          });
          const initialCountries = ["China", "United States of America"];
          initialCountries.forEach(name => {
            selectedCountries.add(name);
            drawTop3Connections(name);
            geojsonLayer.eachLayer(layer => {
              if (layer.feature.properties.name === name) {
                layer.setStyle({ weight: 3, color: '#e67e22' });
              }
            });
          });
          updateCountryPanel();
        }
      });
    });
  setTimeout(() => {
    if (map) addLegend(map);
    resetViewControl.addTo(map);
  }, 1000);

  map.on('zoomend moveend', () => {
    selectedCountries.forEach(countryName => {
      if (arrowsCache[countryName]) {
        renderArrows(countryName, arrowsCache[countryName]);
      }
    });
  });
}


loadMap();

function addLegend(map) {
  const legend = L.control({ position: 'bottomleft' });

  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'info legend');

    const ranges = [
      { label: "100 and more", color: "#2171b5" },
      { label: "10 to less than 100", color: "#6baed6" },
      { label: "0 to less than 10", color: "#c6dbef" },
    ];

    div.innerHTML += '<b style="font-size:14px">Total imports</b><br>';
    ranges.forEach(r => {
      div.innerHTML += `
        <i style="background:${r.color};width:30px;height:14px;display:inline-block;margin-right:6px;border-radius:2px;"></i>
        ${r.label}<br>
      `;
    });

    return div;
  };

  legend.addTo(map);
}

function safeCountryId(name) {
  return 'arrow_group_' + name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function drawTop3Connections(countryName) {
  const filePath = "src/data/tradedata/top3.csv";
  Papa.parse(filePath, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      const data = results.data;
      const year = "2023";
      if (!data || data.length === 0) return;
      const top3 = data.filter(row => row.importer === countryName && row.Year === year);
      if (top3.length === 0) return;

      let from = null;
      geojsonLayer.eachLayer(layer => {
        if (layer.feature.properties.name === countryName) {
          if (customCenters[countryName]) {
            from = customCenters[countryName];

          } else {
            const pt = turf.centerOfMass(layer.feature).geometry.coordinates;
            from = [pt[1], pt[0]];
          }


        }
      });
      if (!from) return;
      const arrows = [];
      top3.forEach(row => {
        const partner = row.exporter;
        const value = parseFloat(row.total_import);
        let to = null;
        geojsonLayer.eachLayer(layer => {
          if (layer.feature.properties.name === partner) {
            if (customCenters[partner]) {
              to = customCenters[partner];
            } else {
              const pt = turf.centerOfMass(layer.feature).geometry.coordinates;
              to = [pt[1], pt[0]];
            }

          }
        });
        if (to && !isNaN(value)) {
          const weight = Math.max(2, Math.min(10, Math.log10(value + 1)));
          const controlLat = (from[0] + to[0]) / 2 + 10;
          const controlLng = (from[1] + to[1]) / 2;
          arrows.push({ from, to, control: [controlLat, controlLng], weight, value, partner });
        }
      });

      arrowsCache[countryName] = arrows;
      renderArrows(countryName, arrows);

      let svgLayer = ensureSvgLayer();
      let svgContainer = d3.select(svgLayer._container).select('svg');
      if (svgContainer.empty()) {
        d3.select(svgLayer._container).html(
          `<svg width="${map.getSize().x}" height="${map.getSize().y}" style="position:absolute;top:0;left:0;pointer-events:none;"><defs></defs></svg>`
        );
        svgContainer = d3.select(svgLayer._container).select('svg');
      }
      const safeId = safeCountryId(countryName);
      svgContainer.select(`#${safeId}`).remove();

      function latLngToPoint(lat, lng) {
        const pt = map.latLngToLayerPoint([lat, lng]);
        return [pt.x, pt.y];
      }
      let svgDefs = '';
      let svgPaths = '';
      arrows.forEach((arrow, idx) => {
        const fromP = latLngToPoint(arrow.to[0], arrow.to[1]);
        const toP = latLngToPoint(arrow.from[0], arrow.from[1]);
        const controlP = latLngToPoint(arrow.control[0], arrow.control[1]);
        const totalLen = Math.hypot(toP[0] - fromP[0], toP[1] - fromP[1]);
        const tailWidth = 2, headWidth = 16, headLen = 25, steps = 80;
        function lerp(a, b, t) { return a + (b - a) * t; }
        function bezier(t, p0, p1, p2) {
          return [
            lerp(lerp(p0[0], p1[0], t), lerp(p1[0], p2[0], t), t),
            lerp(lerp(p0[1], p1[1], t), lerp(p1[1], p2[1], t), t)
          ];
        }
        let centerLine = [];
        for (let i = 0; i <= steps; i++) {
          centerLine.push(bezier(i / steps, fromP, controlP, toP));
        }
        let leftPts = [], rightPts = [];
        for (let i = 0; i <= steps; i++) {
          let t = i / steps;
          let width = tailWidth + (headWidth - tailWidth) * Math.pow(t, 1.7);
          if (t > 1 - headLen / totalLen) {
            width = headWidth * (1 - Math.pow((t - (1 - headLen / totalLen)) / (headLen / totalLen), 1.5));
          }
          let p0 = centerLine[Math.max(i - 1, 0)];
          let p1 = centerLine[Math.min(i + 1, steps)];
          let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
          let len = Math.hypot(dx, dy) || 1;
          let nx = -dy / len, ny = dx / len;
          leftPts.push([centerLine[i][0] - nx * width / 2, centerLine[i][1] - ny * width / 2]);
          rightPts.push([centerLine[i][0] + nx * width / 2, centerLine[i][1] + ny * width / 2]);
        }
        const points = leftPts.concat(rightPts.reverse()).map(p => p.join(',')).join(' ');

        const gradientId = `arrow-anim-gradient-${safeId}-${idx}`;
        svgDefs += `
            // <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
            //   <stop offset="0%" stop-color="orange" />
            //   <stop offset="40%" stop-color="orange" />
            //   <stop offset="50%" stop-color="#fffbe7">
            //     <animate attributeName="offset" values="0.4;0.7;0.4" dur="1.2s" repeatCount="indefinite"/>
            //   </stop>
            //   <stop offset="60%" stop-color="orange" />
            //   <stop offset="100%" stop-color="orange" />
            // </linearGradient>
          `;
        svgPaths += `
            <polygon points="${points}" 
              fill="url(#${gradientId})"
              fill-opacity="0.92"
              stroke="orange"
              stroke-width="2"
              stroke-opacity="0.7"
            />
          `
      });

      let defs = svgContainer.select('defs');
      defs.html(defs.html() + svgDefs);

      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("id", safeId);
      group.innerHTML = svgPaths;
      svgContainer.node().appendChild(group);
    }
  });
}

function removeCountryArrows(countryName) {
  let svgLayer = ensureSvgLayer();
  let svgContainer = d3.select(svgLayer._container).select('svg');
  if (!svgContainer.empty()) {
    const safeId = safeCountryId(countryName);
    svgContainer.select(`#${safeId}`).remove();
  }
}

document.addEventListener("DOMContentLoaded", function () {
  Papa.parse("src/data/covid-19data/goal08.gdp_loss.csv", {
    download: true,
    header: true,
    dynamicTyping: true,
    complete: function (results) {
      const data = results.data.filter(d => d.iso3c && d.year && d.value !== undefined);
      drawGDPBarChart(data, "gdp-bar-chart");
    }
  });
});

function drawGDPBarChart(data, containerId = "gdp-bar-chart") {
  const region = "WLT";
  const regionData = data
    .filter(d => d.iso3c === region && d.year >= 2000 && d.year <= 2024)
    .map(d => ({ ...d, year: +d.year, value: +d.value }));

  const labelYears = [2000, 2009, 2020, 2024];
  const xTicks = regionData.map(d => d.year).filter(year => year % 5 === 0 || labelYears.includes(year));

  const margin = { top: 80, right: 30, bottom: 80, left: 50 };
  const width = 900 - margin.left - margin.right;
  const height = 600 - margin.top - margin.bottom;

  d3.select(`#${containerId}`).html("");

  const svg = d3.select(`#${containerId}`)
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .domain(regionData.map(d => d.year))
    .range([0, width])
    .padding(0.1);

  const y = d3.scaleLinear()
    .domain([
      Math.min(0, d3.min(regionData, d => d.value)),
      d3.max(regionData, d => d.value) * 1.1
    ])
    .range([height, 0]);

  svg.append("g")
    .attr("transform", `translate(0,${height + 15})`)
    .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(d3.format("d")))
    .selectAll("text")
    .attr("font-size", "13px")
    .attr("fill", "#222")
    .attr("transform", "rotate(-40)")
    .style("text-anchor", "end");

  svg.append("g")
    .call(d3.axisLeft(y).ticks(6))
    .selectAll("text")
    .attr("font-size", "14px");

  const bars = svg.selectAll("rect")
    .data(regionData)
    .enter()
    .append("rect")
    .attr("x", d => x(d.year))
    .attr("y", d => d.value >= 0 ? y(d.value) : y(0))
    .attr("width", x.bandwidth())
    .attr("height", d => Math.abs(y(d.value) - y(0)))
    .attr("fill", d => d.value >= 0 ? "#4682b4" : "#e57373")
    .on("mouseover", function (event, d) {
      d3.select(this)
        .attr("fill", "#0d47a1")

      tooltip.style("opacity", 1)
        .html(`<strong>${d.year}</strong><br/>GDP growth：${d.value}%`)
        .style("left", (event.pageX + 12) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function (event, d) {
      d3.select(this)
        .attr("fill", d.value >= 0 ? "#4682b4" : "#e57373")
        .attr("stroke", "none");

      tooltip.style("opacity", 0);
    });

  svg.selectAll("text.value")
    .data(regionData.filter(d => labelYears.includes(d.year)))
    .enter()
    .append("text")
    .attr("class", "value")
    .attr("x", d => x(d.year) + x.bandwidth() / 2)
    .attr("y", d => d.value >= 0 ? y(d.value) - 10 : y(d.value) + 22)
    .attr("text-anchor", "middle")
    .attr("font-size", "22px")
    .attr("font-weight", "bold")
    .attr("fill", "#1a237e")
    .text(d => d.value > 0 ? `+${d.value}%` : `${d.value}%`);

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", -40)
    .attr("text-anchor", "middle")
    .attr("font-size", "20px")
    .attr("font-weight", "bold")
    .attr("fill", "#1a237e")
    .text("COVID-19 took a heavy toll on the global economy in 2020");

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", -10)
    .attr("text-anchor", "middle")
    .attr("font-size", "20px")
    .attr("fill", "#888")
    .text("GDP growth (annual %)");

  const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("background", "#fff")
    .style("padding", "8px 12px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "4px")
    .style("pointer-events", "none")
    .style("font-size", "14px")
    .style("box-shadow", "0 0 8px rgba(0,0,0,0.1)")
    .style("opacity", 0);
}

document.addEventListener("DOMContentLoaded", function () {
  Papa.parse("src/data/covid-19data/goal08.gdp_loss.csv", {
    download: true,
    header: true,
    dynamicTyping: true,
    complete: function (results) {
      const data = results.data.filter(d => d.iso3c && d.year && d.value !== undefined);
      drawGDPBarChart(data, "gdp-bar-chart");
    }
  });
});

const unifiedColor = '#1f77b4';


function initExportDestinationChart(csvPath = "src/data/tradedata/2019_2023.csv") {
  let charts = {};

  Papa.parse(csvPath, {
    download: true,
    header: true,
    complete: function (results) {
      const data = results.data;
      const groupedData = {};

      data.forEach(row => {
        const year = parseInt(row["Year"]);
        const region = row["Economy Label"];
        const partner = row["Partner Label"];
        const product = row["Product Label"];
        const value = parseFloat(row["US$ at current prices in thousands"]);

        if (!year || !region || !partner || !product || isNaN(value)) return;
        if (product !== "TOTAL ALL PRODUCTS") return;

        if (!groupedData[year]) groupedData[year] = {};
        if (!groupedData[year][region]) groupedData[year][region] = {};
        groupedData[year][region][partner] = (groupedData[year][region][partner] || 0) + value;
      });

      const years = Object.keys(groupedData).sort();
      const select = document.getElementById("yearSelect");
      if (!select) return;

      years.forEach(year => {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        select.appendChild(option);
      });

      select.addEventListener("change", () => {
        renderCharts(groupedData[select.value]);
      });

      select.value = years[4];
      renderCharts(groupedData[years[0]]);
    }
  });

  function renderCharts(dataByRegion) {
    renderSingleChart("chartAfrica", dataByRegion["Developing economies: Africa"]);
    renderSingleChart("chartAsia", dataByRegion["Developing economies: Asia"]);
    renderSingleChart("chartAmericas", dataByRegion["Developing economies: Americas"]);
  }

  function renderSingleChart(canvasId, data) {
    const ctx = document.getElementById(canvasId)?.getContext("2d");
    if (!ctx) return;

    if (!data) {
      if (charts[canvasId]) charts[canvasId].destroy();
      return;
    }

    const sortedEntries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = sortedEntries.map(e => e[0]);
    const values = sortedEntries.map(e => (e[1] / 1_000_000).toFixed(2));

    if (charts[canvasId]) charts[canvasId].destroy();

    charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Exports (billion USD)',
          data: values,
          backgroundColor: 'rgba(96, 165, 250, 0.7)',
          borderRadius: 4,
          barThickness: 28
        }]
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: true,
        aspectRatio: 3.5,
        interaction: {
          mode: 'nearest',
          axis: 'y',
          intersect: false
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.raw} billion USD`
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Export Value (billion USD)',
              font: { size: 14 }
            }
          },
          y: {
            ticks: {
              font: { size: 13 }
            }
          }
        }
      }
    });
  }
}
document.addEventListener("DOMContentLoaded", () => {
  initExportDestinationChart("src/data/tradedata/2019_2023.csv");
});

// ==========================\n// Regional Trade Intra vs Extra Export Chart Module\n// ==========================\n
function initRegionalIntraExtraChart(csvPath = "src/data/tradedata/Modified_Regional_Trade_Data_2019_2023.csv") {
  let chart = null;

  Papa.parse(csvPath, {
    download: true,
    header: true,
    complete: function (results) {
      const rawData = results.data;
      const dataByYear = {};

      rawData.forEach(row => {
        const year = row.Year;
        const region = row.Region;
        const intra = parseFloat(row["Intra (in thousands of USD)"]);
        const extra = parseFloat(row["Extra (in thousands of USD)"]);
        const total = parseFloat(row["Total (in thousands of USD)"]);

        if (!year || !region || isNaN(intra) || isNaN(extra) || isNaN(total)) return;

        if (!dataByYear[year]) dataByYear[year] = {};
        dataByYear[year][region] = {
          intraPercent: (intra / total * 100).toFixed(1),
          extraPercent: (extra / total * 100).toFixed(1)
        };
      });

      initDropdown(Object.keys(dataByYear).sort(), dataByYear);
    }
  });

  function initDropdown(years, dataByYear) {
    const select = document.getElementById("regionalYearSelect");
    if (!select) return;

    years.forEach(year => {
      const opt = document.createElement("option");
      opt.value = year;
      opt.textContent = year;
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      updateChart(dataByYear[select.value]);
    });

    const latest = years[years.length - 1];
    select.value = latest;
    updateChart(dataByYear[latest]);
  }

  function updateChart(yearData) {
    const regions = Object.keys(yearData);
    const intraData = regions.map(region => parseFloat(yearData[region].intraPercent));
    const extraData = regions.map(region => parseFloat(yearData[region].extraPercent));

    const ctx = document.getElementById("exportsChart").getContext("2d");

    const baseIntraColor = '#60a5fa';
    const baseExtraColor = '#fdba74';

    const config = {
      type: 'bar',
      data: {
        labels: regions,
        datasets: [
          {
            label: 'Intra',
            data: intraData,
            backgroundColor: new Array(regions.length).fill(baseIntraColor),
            borderRadius: 5,
            barThickness: 38
          },
          {
            label: 'Extra',
            data: extraData,
            backgroundColor: new Array(regions.length).fill(baseExtraColor),
            borderRadius: 5,
            barThickness: 38
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#444',
              font: { size: 14 }
            }
          },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.raw}%`
            }
          },
          datalabels: {
            display: false
          }
        },
        animation: {
          duration: 800,
          easing: 'easeOutCubic'
        },
        onHover: (event, elements) => {
          const datasets = chart.data.datasets;
          if (elements.length > 0) {
            const index = elements[0].index;
            const datasetIndex = elements[0].datasetIndex;

            datasets.forEach((dataset, i) => {
              dataset.backgroundColor = dataset.data.map((_, idx) => {
                if (idx === index) {
                  return i === datasetIndex
                    ? (i === 0 ? baseIntraColor : baseExtraColor)
                    : (i === 0 ? 'rgba(96,165,250,0.7)' : 'rgba(251,146,60,0.7)');
                } else {
                  return i === 0 ? baseIntraColor : baseExtraColor;
                }
              });
            });
            chart.update('none');
          } else {
            datasets[0].backgroundColor = new Array(regions.length).fill(baseIntraColor);
            datasets[1].backgroundColor = new Array(regions.length).fill(baseExtraColor);
            chart.update('none');
          }
        },
        scales: {
          x: {
            stacked: true,
            max: 100,
            ticks: {
              callback: val => val + '%',
              font: { size: 12 },
              color: '#333'
            },
            grid: { color: '#eee' }
          },
          y: {
            stacked: true,
            ticks: {
              font: { size: 14 },
              color: '#222'
            },
            grid: { color: '#f3f3f3' }
          }
        }
      },
      plugins: [ChartDataLabels]
    };

    if (chart) chart.destroy();
    chart = new Chart(ctx, config);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initRegionalIntraExtraChart("src/data/tradedata/Modified_Regional_Trade_Data_2019_2023.csv");

});


d3.csv("src/data/covid-19data/gdp_diff_countries_with_full_names.csv").then(data => {
  const countries = [...new Set(data.map(d => d.country))].sort();
  const dropdown = d3.select("#country");

  countries.forEach(country => {
    dropdown.append("option").text(country).attr("value", country);
  });

  dropdown.property("value", "China");

  updateChart(data, "China");

  dropdown.on("change", () => updateChart(data, dropdown.node().value));

  const groups = [
    {
      countries: ["China", "United States", "United Kingdom"],
      description: "Major Economies: China, USA, UK",
      intro: "The United States and China  are among the world’s largest and most influential economies. The UK economy was impacted not only by the COVID-19 pandemic but also by Brexit in 2020."
    },
    {
      countries: ["Nicaragua", "Guyana"],
      description: "Emerging Economies: Nicaragua, Guyana",
      intro: "Countries such as Nicaragua and Guyana have benefited from higher commodity prices and the discovery of natural resources, such as higher gold & coffee prices, and exports of oil & gas."
    },
    {
      countries: ["Thailand", "Fiji"],
      description: "Tourism-Dependent Economies: Thailand, Fiji",
      intro: "COVID-19 dealt an especially severe blow to tourism-dependent economies. Fiji and Thailand, which are heavily dependent on tourism revenue, experienced significant impacts on their GDPs during the pandemic."
    }
  ];

  const containerWidth = window.innerWidth;
  const svg = d3.select("#grouped-chart")
    .attr("width", containerWidth)
    .attr("height", 1300);


  const x = d3.scaleLinear().domain([2019, 2024]).range([50, 350]);

  const tooltip = d3.select("body").append("div")
    .attr("class", "hover-label")
    .style("position", "absolute")
    .style("background", "rgba(255, 255, 255, 0.95)")
    .style("padding", "8px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "6px")
    .style("box-shadow", "0 0 6px rgba(0,0,0,0.2)")
    .style("font-size", "12px")
    .style("font-family", "sans-serif")
    .style("display", "none")
    .style("pointer-events", "none")
    .style("z-index", "1000");

  groups.forEach((group, groupIndex) => {
    const sectionY = groupIndex * 440 + 20;

    svg.append("text")
      .attr("x", window.innerWidth / 2)
      .attr("y", sectionY)
      .attr("text-anchor", "middle")
      .text(group.intro)
      .attr("font-size", "15px")
      .attr("font-weight", "normal")
      .attr("fill", "#333");

    svg.append("text")
      .attr("x", window.innerWidth / 2)
      .attr("y", sectionY + 30)
      .attr("text-anchor", "middle")
      .text(group.description)
      .attr("font-size", "18px")
      .attr("font-weight", "bold");

    svg.append("text")
      .attr("x", window.innerWidth / 2)
      .attr("y", sectionY + 55)
      .attr("text-anchor", "middle")
      .text("Level of GDP compared to pre-COVID projections (value for 2019=100)")
      .attr("font-size", "14px")
      .attr("fill", "#666");

    group.countries.forEach((country, index) => {
      const countryData = data.filter(d => d.country === country);
      const totalWidth = group.countries.length * 350 + (group.countries.length - 1) * 60;
      const startX = (window.innerWidth - totalWidth) / 2;
      const xOffset = startX + index * 420;
      const yOffset = sectionY + 90;

      const y = (country === "Guyana")
        ? d3.scaleLinear().domain([50, 450]).range([250, 50])
        : (country === "Nicaragua")
          ? d3.scaleLinear().domain([50, 180]).range([250, 50])
          : (country === "United States")
            ? d3.scaleLinear().domain([80, 130]).range([250, 50])
            : d3.scaleLinear().domain([80, 130]).range([250, 50]);

      const svgCountry = svg.append("g")
        .attr("class", "chart-group")
        .attr("transform", `translate(${xOffset},${yOffset})`);

      svgCountry.append("text")
        .attr("x", 225)
        .attr("y", 30)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .style("fill", "#222")
        .text(country);

      svgCountry.append("g")
        .attr("class", "x-axis")
        .attr("transform", "translate(0,260)")
        .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("d")))
        .style("font-size", "12px");

      svgCountry.append("g")
        .attr("class", "y-axis")
        .attr("transform", "translate(40,0)")
        .call(d3.axisLeft(y).ticks(6))
        .style("font-size", "12px");

      svgCountry.append("path")
        .datum(countryData)
        .attr("fill", "rgba(240, 246, 252, 0.8)")
        .attr("stroke", "#004080")
        .attr("stroke-width", 2)
        .attr("d", d3.area()
          .x(d => x(+d.year))
          .y0(d => y(+d.gdp))
          .y1(d => y(+d.gdp_forc20))
          .curve(d3.curveBasis));

      svgCountry.append("path")
        .datum(countryData)
        .attr("stroke", "#999")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4,2")
        .attr("fill", "none")
        .attr("d", d3.line()
          .x(d => x(+d.year))
          .y(d => y(+d.gdp_forc20))
          .curve(d3.curveBasis));

      svgCountry.selectAll(".dot")
        .data(countryData)
        .enter()
        .append("circle")
        .attr("class", "dot")
        .attr("cx", d => x(+d.year))
        .attr("cy", d => y(+d.gdp))
        .attr("r", 5)
        .attr("fill", "red")
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
          tooltip.style("display", "block")
            .html(`
              <div style="font-weight: bold; font-size: 14px;">${d.country}, ${d.year}</div>
              <div>Change: 
                <strong style="color: ${(d.gdp - d.gdp_forc20) < 0 ? 'red' : 'green'};">
                  ${((d.gdp - d.gdp_forc20) / d.gdp_forc20 * 100).toFixed(1)}%
                </strong>
              </div>
              <div>Total difference: 
                <strong style="color: #111;">${(d.gdp - d.gdp_forc20).toFixed(2)} billion dollars</strong>
              </div>
            `)
            .style("left", `${event.pageX + 15}px`)
            .style("top", `${event.pageY - 40}px`);
        })
        .on("mouseout", function () {
          tooltip.style("display", "none");
        });
    });
  });
});



function updateChart(data, country) {
  const svg = d3.select("#chart")
    .attr("width", 1000)
    .attr("height", 600);

  svg.selectAll("*").remove();
  const tooltip = d3.select("#tooltip");

  if (!country) return;

  const countryData = data.filter(d => d.country === country);
  const x = d3.scaleLinear().domain([2019, 2024]).range([80, 920]);
  const y = d3.scaleLinear().domain([85, 130]).range([533, 50]);

  svg.append("path")
    .datum(countryData)
    .attr("class", "area")
    .attr("d", d3.area().curve(d3.curveBasis)
      .x(d => x(+d.year))
      .y0(d => y(+d.gdp))
      .y1(d => y(+d.gdp_forc20)));

  svg.append("path")
    .datum(countryData)
    .attr("class", "line")
    .attr("stroke", "#0056b3")
    .attr("stroke-width", 5)
    .attr("fill", "none")
    .attr("d", d3.line().x(d => x(+d.year)).y(d => y(+d.gdp)).curve(d3.curveBasis));

  svg.append("path")
    .datum(countryData)
    .attr("class", "line")
    .attr("stroke", "grey")
    .attr("stroke-width", 5)
    .attr("stroke-dasharray", "4 2")
    .attr("fill", "none")
    .attr("d", d3.line().x(d => x(+d.year)).y(d => y(+d.gdp_forc20)).curve(d3.curveBasis));

  svg.selectAll(".dot")
    .data(countryData)
    .enter().append("circle")
    .attr("class", "dot")
    .attr("cx", d => x(+d.year))
    .attr("cy", d => y(+d.gdp))
    .attr("r", 5)
    .attr("fill", "red")
    .on("mouseover", function (event, d) {
      svg.selectAll(".hover-label").remove();

      const [xPos, yPos] = [x(+d.year), y(+d.gdp)];

      svg.append("foreignObject")
        .attr("x", xPos - 150)
        .attr("y", yPos + 20)
        .attr("width", 220)
        .attr("height", 100)
        .attr("class", "hover-label")
        .html(`
          <div xmlns="http://www.w3.org/1999/xhtml" style="
            font-size: 12px;
            font-family: sans-serif;
            background: rgba(255,255,255,0.9);
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 6px;
            box-shadow: 0 0 6px rgba(0,0,0,0.1);
          ">
            <div style="font-weight: bold; font-size: 16px;">${d.country}, ${d.year}</div>
            <div>Change: 
              <strong style="color: ${(d.gdp - d.gdp_forc20) < 0 ? 'red' : 'green'};">
                ${((d.gdp - d.gdp_forc20) / d.gdp_forc20 * 100).toFixed(1)}%
              </strong>
            </div>
            <div>Total difference: 
              <strong style="color: #111;">${(d.gdp - d.gdp_forc20).toFixed(2)} billion dollars</strong>
            </div>
          </div>
        `);
    })
    .on("mouseout", () => {
      svg.selectAll(".hover-label").remove();
    });

  // Grid X axis
  svg.append("g")
    .call(d3.axisBottom(x)
      .ticks(6)
      .tickFormat(d3.format("d"))
      .tickSize(-svg.attr("height")))
    .attr("transform", "translate(0,533)")
    .attr("class", "grid")
    .selectAll("line")
    .attr("stroke", "#ddd")
    .attr("stroke-dasharray", "3,3");

  svg.selectAll(".grid text")
    .style("font-size", "14px")
    .style("font-weight", "bold");

  // Grid Y axis
  svg.append("g")
    .call(d3.axisLeft(y)
      .ticks(4)
      .tickSize(-svg.attr("width"))
      .tickFormat(d3.format("d")))
    .attr("transform", "translate(80,0)")
    .attr("class", "grid")
    .selectAll("line")
    .attr("stroke", "#ddd")
    .attr("stroke-dasharray", "2,2");

  svg.selectAll(".grid text")
    .style("font-size", "14px")
    .style("font-weight", "bold");
}



function loadDashboard(csvPath = "src/data/tradedata/top3.csv") {
  let rawData = [];
  let chartInstance;

  const table = $('#dataTable').DataTable({
    data: [],
    columns: [
      { data: 'Year' },
      { data: 'importer' },
      { data: 'exporter' },
      {
        data: 'total_import',
        render: val => parseFloat(val).toLocaleString('en-US', {
          style: 'currency', currency: 'USD', maximumFractionDigits: 0
        })
      }
    ]
  });

  $('#toggleChartBtn').on('click', function () {
    const container = $('#chartContainer');
    if (container.is(':visible')) {
      container.slideUp();
      $(this).text("⬇︎ Show Chart ");
    } else {
      container.slideDown();
      $(this).text("⬆︎ Hidden chart");
    }
  });


  Papa.parse(csvPath, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      rawData = results.data;

      const importers = [...new Set(rawData.map(d => d.importer))].sort();
      const select = $('#importerSelect');
      importers.forEach(imp => {
        select.append(new Option(imp, imp));
      });

      select.select2({
        placeholder: "Select one or more Importer countries",
        width: '300px',
        allowClear: true
      });

      select.on("change", updateDisplay);
      updateDisplay();
    }
  });

  function updateDisplay() {
    const selected = $('#importerSelect').val(); // array of selected values

    const filtered = rawData.filter(d =>
      selected.length === 0 || selected.includes(d.importer)
    );

    const grouped = {};
    filtered.forEach(d => {
      if (!grouped[d.exporter]) grouped[d.exporter] = 0;
      grouped[d.exporter] += parseFloat(d.total_import);
    });

    const chartData = Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const total = filtered.reduce((sum, d) => sum + parseFloat(d.total_import), 0);
    const summary = `Showing ${filtered.length} records. Total Imports: $${total.toLocaleString()}`;
    document.getElementById("summaryBox").textContent = summary;

    table.clear().rows.add(filtered).draw();
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(document.getElementById("barChart").getContext("2d"), {
      type: "bar",
      data: {
        labels: chartData.map(e => e[0]),
        datasets: [{
          label: "Total Import",
          data: chartData.map(e => e[1]),
          backgroundColor: "#1f77b4"
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value => '$' + (value / 1e6).toFixed(0) + 'M'
            }
          }
        }
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => loadDashboard());


document.addEventListener("DOMContentLoaded", () => {
  initSharedProsperityScatterPlot("scatter-svg", "src/data/covid-19data/sharedprosperity.csv");

});

const steps = [first, second, third, fourth, fifth, sixth];
let currentStep = 0;
let scrollAccumulator = 0;
const SCROLL_THRESHOLD = 500;
let infoBoxOffset = 0;
let scatterVisible = true;

const highlightedCountries = [
  "Benin", "Botswana", "Ethiopia", "Ghana", "Mauritius", "Malawi",
  "Namibia", "Rwanda", "Sierra Leone", "Eswatini", "Togo",
  "Uganda", "Zambia", "Zimbabwe", "Tanzania, United Republic of"
];
const southAsiaCountries = ["Sri Lanka", "Pakistan", "Bhutan", "Bangladesh"];
const eastAsiaCountries = ["China", "Philippines", "Viet Nam", "Thailand", "Malaysia", "Mongolia", "Indonesia"];



document.getElementById("sharedprosperity").addEventListener("wheel", handleWheel, { passive: false });
observeScroll();
observeScatterVisibility();

steps[0]();


function observeScatterVisibility() {
  const scatterObserver = new IntersectionObserver((entries) => {
    scatterVisible = entries[0].isIntersecting;
  }, {
    root: null,
    threshold: 0.7
  });

  scatterObserver.observe(document.querySelector("#scatter-svg"));
}

function handleWheel(event) {
  if (!scatterVisible) return;

  event.preventDefault();
  scrollAccumulator += event.deltaY;

  if (currentStep === 0 && event.deltaY < 0) {
    enableFreeScroll();
    return;
  }

  if (scrollAccumulator > SCROLL_THRESHOLD) {
    if (currentStep < steps.length - 1) {
      currentStep++;
      steps[currentStep]();
      scrollAccumulator = 0;
    } else if (currentStep === steps.length - 1) {
      enableFreeScroll();
    }
  } else if (scrollAccumulator < -SCROLL_THRESHOLD) {
    if (currentStep > 0) {
      currentStep--;
      steps[currentStep]();
      scrollAccumulator = 0;
    }
  }
}


function enableFreeScroll() {
  document.getElementById("sharedprosperity").removeEventListener("wheel", handleWheel);
  document.removeEventListener("wheel", freeScroll);
  resetInfoBoxPointerEvents();
}

function disableFreeScroll() {
  document.getElementById("sharedprosperity").addEventListener("wheel", handleWheel, { passive: false });
  resetInfoBoxPointerEvents();
}

function freeScroll(event) {
  const sectionTop = document.getElementById("sharedprosperity").offsetTop;
  const sectionHeight = document.getElementById("sharedprosperity").offsetHeight;
  const scrollY = window.scrollY;
  const windowHeight = window.innerHeight;


  if (event.deltaY < 0 && scrollY + windowHeight > sectionTop && scrollY < sectionTop + sectionHeight) {
    disableFreeScroll();
  }
}

function observeScroll() {
  window.addEventListener("scroll", () => {
    const sectionTop = document.getElementById("sharedprosperity").offsetTop;
    const sectionHeight = document.getElementById("sharedprosperity").offsetHeight;
    const scrollY = window.scrollY;
    const windowHeight = window.innerHeight;
    if (scrollY + windowHeight > sectionTop && scrollY < sectionTop + sectionHeight) {
      disableFreeScroll();
    } else {
      enableFreeScroll();
    }
  });
}

function resetInfoBoxPointerEvents() {
  document.querySelectorAll(".info-box").forEach(box => {
    box.style.pointerEvents = "auto";
  });
}


function initSharedProsperityScatterPlot(containerId, csvPath) {
  const width = 600, height = 600;
  const svg = d3.select(`#${containerId}`)
    .attr("width", width)
    .attr("height", height);

  svg.selectAll("*").remove();

  const tooltipBox = d3.select("body").append("div")
    .attr("class", "tooltip-box")
    .style("position", "absolute")
    .style("background", "#fff")
    .style("border", "1px solid #ddd")
    .style("padding", "8px 12px")
    .style("box-shadow", "0 4px 12px rgba(0,0,0,0.15)")
    .style("pointer-events", "none")
    .style("border-radius", "6px")
    .style("font-family", "sans-serif")
    .style("line-height", "1.4")
    .style("z-index", "9999")
    .style("color", "#000");

  d3.csv(csvPath).then(data => {
    const x = d3.scaleLinear().domain([-5, 10]).range([50, width - 50]);
    const y = d3.scaleLinear().domain([-5, 10]).range([height - 50, 50]);
    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([-5, 10]);

    const diagonalLine = svg.append("line")
      .attr("x1", x(-5))
      .attr("y1", y(-5))
      .attr("x2", x(10))
      .attr("y2", y(10))
      .attr("stroke", "#000")
      .attr("stroke-width", 3)
      .style("opacity", 0);

    const grayArea = svg.append("polygon")
      .attr("points", `
        ${x(-5)},${y(10)} 
        ${x(-5)},${y(-5)} 
        ${x(10)},${y(10)} 
        ${x(-5)},${y(10)}
      `)
      .attr("fill", "#d3d3d3")
      .attr("opacity", 0)
      .lower();

    svg.selectAll(".dot")
      .data(data)
      .enter().append("circle")
      .attr("class", "dot")
      .attr("cx", d => x(+d["growthb40"]))
      .attr("cy", d => y(+d["growthtotal"]))
      .attr("r", 6)
      .attr("fill", d => colorScale(+d["growthb40"]))
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        tooltipBox.style("display", "block")
          .html(`<h3>${d.Country}</h3>
                 <p><strong>${d["growthtotal"]}%</strong> Growth in mean income<br>
                 <strong>${d["growthb40"]}%</strong> Growth for bottom 40% income</p>`)
          .style("left", (event.pageX + 15) + "px")
          .style("top", (event.pageY - 40) + "px");
      })
      .on("mouseout", () => tooltipBox.style("display", "none"));



    svg.append("g")
      .attr("transform", `translate(0,${height - 50})`)
      .call(d3.axisBottom(x).ticks(10).tickSize(-height + 100))
      .call(g => g.select(".domain").remove())
      .selectAll("line").attr("stroke", "#e0e0e0");

    svg.append("g")
      .attr("transform", `translate(50,0)`)
      .call(d3.axisLeft(y).ticks(10).tickSize(-width + 100))
      .call(g => g.select(".domain").remove())
      .selectAll("line").attr("stroke", "#e0e0e0");

    svg.append("text")
      .attr("x", 100).attr("y", 30)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .text("↑ Growth in mean income");

    svg.append("text")
      .attr("x", width / 2).attr("y", height - 10)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .text("Growth for bottom 40% income →");


    window.svg = svg;
    window.diagonalLine = diagonalLine;
    window.grayArea = grayArea;
  });
}

function rotateSVG(deg) {
  d3.select("#scatter-svg")
    .style("transform", `rotate(${deg}deg)`)
    .style("transform-origin", "50% 50%")
    .style("transition", "transform 0.6s ease");
}

function first() {
  reset();
  show("firstInfoBox");
  hideDiagonal();
  hideGrayArea();
  rotateSVG(0);
  highlightNone();
}

function second() {
  reset();
  show("secondInfoBox");
  showDiagonal();
  hideGrayArea();
  rotateSVG(0);
  highlightNone();
}

function third() {
  reset();
  show("thirdInfoBox");
  showDiagonal();
  showGrayArea();
  rotateSVG(-45);
  highlightNone();
}

function fourth() {
  reset();
  show("fourthInfoBox");
  showDiagonal();
  showGrayArea();
  rotateSVG(-45);
  highlightGroup(highlightedCountries);
}

function fifth() {
  reset();
  show("fifthInfoBox");
  showDiagonal();
  showGrayArea();
  rotateSVG(-45);
  highlightGroup(southAsiaCountries);
}

function sixth() {
  reset();
  show("sixthInfoBox");
  showDiagonal();
  showGrayArea();
  rotateSVG(-45);
  highlightGroup(eastAsiaCountries);
  enableFreeScroll();
}



function reset() {
  infoBoxOffset = 0;
  document.querySelectorAll(".info-box").forEach(box => {
    box.style.opacity = 0;
    box.style.pointerEvents = "none";
    box.style.transform = "translate(-50%, -50%)";
  });
  d3.selectAll(".dot").transition().duration(500).style("opacity", 1).attr("r", 6);
}


function show(id) {
  document.getElementById(id).style.opacity = 1;
  document.getElementById(id).style.pointerEvents = "auto";
}

function showDiagonal() {
  window.diagonalLine.transition().duration(500).style("opacity", 1);
}

function showGrayArea() {
  window.grayArea.transition().duration(500).style("opacity", 0.3);
}

function hideDiagonal() {
  window.diagonalLine.transition().duration(500).style("opacity", 0);
}

function hideGrayArea() {
  window.grayArea.transition().duration(500).style("opacity", 0);
}

function highlightGroup(countryList) {
  svg.selectAll(".dot")
    .transition().duration(500)
    .style("opacity", d => countryList.includes(d.Country) ? 1 : 0.1)
    .attr("r", d => countryList.includes(d.Country) ? 8 : 6);
}

function highlightNone() {
  svg.selectAll(".dot")
    .transition().duration(500)
    .style("opacity", 1)
    .attr("r", 6);
}
function show(id) {
  const box = document.getElementById(id);
  box.style.opacity = 1;
  box.style.pointerEvents = "auto";
  box.style.transform = "translate(-50%, -60%)";
}


