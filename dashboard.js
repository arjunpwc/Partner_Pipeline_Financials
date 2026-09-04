(function () {
  const DATA_URL = "./data/pipeline.json";

  const errorBanner = document.getElementById("error-banner");
  const dashboard = document.getElementById("dashboard");
  const dataAsOf = document.getElementById("data-as-of");
  const loadingNote = document.getElementById("loading-note");

  function hideLoading() {
    if (loadingNote) loadingNote.hidden = true;
  }

  function showError(message, detail) {
    hideLoading();
    dashboard.hidden = true;
    dataAsOf.hidden = true;
    errorBanner.hidden = false;
    errorBanner.innerHTML =
      "<strong>Dashboard data could not be loaded.</strong>" +
      "<span>" +
      escapeHtml(message) +
      (detail ? " " + escapeHtml(detail) : "") +
      "</span>";
  }

  window.addEventListener("error", function (event) {
    showError(
      "A script error stopped the dashboard: " + (event.message || "unknown error"),
      event.filename ? "(" + event.filename + ":" + event.lineno + ")" : ""
    );
  });

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDataAsOf(isoTimestamp) {
    const parsed = new Date(isoTimestamp);
    if (Number.isNaN(parsed.getTime())) {
      return "Data as of unknown time";
    }
    const formatted = parsed.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    return "Data as of " + formatted;
  }

  function sectionBody(sectionId) {
    return document.querySelector("#" + sectionId + " [data-render]");
  }

  function setPlaceholder(sectionId, text) {
    const body =
      sectionBody(sectionId) || document.getElementById(sectionId);
    if (!body) return;
    body.innerHTML = '<p class="placeholder">' + escapeHtml(text) + "</p>";
  }

  function formatMillions(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return "—";
    return "$" + (n / 1e6).toFixed(1) + "M";
  }

  function formatCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return Math.round(n).toLocaleString();
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function hexToRgba(hex, alpha) {
    var h = String(hex || "").replace("#", "").trim();
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some(function (n) { return Number.isNaN(n); })) {
      return "rgba(0, 0, 0, " + alpha + ")";
    }
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  }

  const FUNNEL_STAGES = ["Target", "Interact", "Propose", "Close", "Won"];
  const PARTNER_BAR_COLOR = cssVar("--pwc-orange-500");
  const DCM_BAR_COLOR = cssVar("--pwc-grey-400");
  const CHART_GRID_COLOR = cssVar("--pwc-grey-100");
  const CHART_LABEL_COLOR = cssVar("--pwc-grey-500");
  const CHART_FILL_PRIMARY = hexToRgba(PARTNER_BAR_COLOR, 0.12);
  const CHART_FILL_COMPARE = hexToRgba(DCM_BAR_COLOR, 0.12);
  const CHART_PALETTE = [
    cssVar("--pwc-orange-500"),
    cssVar("--pwc-orange-400"),
    cssVar("--pwc-orange-300"),
    cssVar("--pwc-orange-200"),
    cssVar("--pwc-grey-500"),
    cssVar("--pwc-grey-400"),
    cssVar("--pwc-grey-300"),
  ];
  let stageFunnelChart = null;

  function kpiCard(label, value, extraClass) {
    return (
      '<article class="kpi-card' +
      (extraClass ? " " + extraClass : "") +
      '">' +
      '<p class="kpi-value">' +
      escapeHtml(value) +
      "</p>" +
      '<p class="kpi-label">' +
      escapeHtml(label) +
      "</p>" +
      "</article>"
    );
  }

  function nextFyLabel(label) {
    var match = String(label || "").match(/FY(\d{2})/i);
    if (!match) return "the next fiscal year";
    var next = (parseInt(match[1], 10) + 1) % 100;
    return "FY" + String(next).padStart(2, "0");
  }

  function formatYoy(value) {
    if (value == null || value === "") {
      return "—";
    }
    var n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    var pct = (n * 100).toFixed(1) + "%";
    return n > 0 ? "+" + pct : pct;
  }

  function yoyCaption(value) {
    if (value == null || value === "") {
      return "YoY Growth — prior year data not yet available";
    }
    return "YoY Growth";
  }

  function renderFyNote(fyLabel) {
    var body = sectionBody("fy-note");
    if (!body) return;
    var label = fyLabel || "FY26";
    body.textContent =
      "Showing " + label + " metrics. Next refresh will incorporate " + nextFyLabel(label) + " data.";
  }

  function renderKpiCards(payload) {
    const body = sectionBody("kpi-cards");
    if (!body) return;
    const data = (payload && payload.kpis) || payload || {};
    const yoy = (payload && payload.yoy_growth) || {};
    body.innerHTML =
      '<div class="kpi-grid">' +
      '<div class="kpi-pair">' +
      kpiCard("Total open pipeline", formatMillions(data.total_open_pipeline)) +
      kpiCard(yoyCaption(yoy.total_open_pipeline), formatYoy(yoy.total_open_pipeline), "kpi-yoy") +
      "</div>" +
      '<div class="kpi-pair">' +
      kpiCard("Open opportunities", formatCount(data.open_opportunity_count)) +
      kpiCard(yoyCaption(yoy.open_opportunity_count), formatYoy(yoy.open_opportunity_count), "kpi-yoy") +
      "</div>" +
      '<div class="kpi-pair">' +
      kpiCard("Total won", formatMillions(data.total_won)) +
      kpiCard(yoyCaption(yoy.total_won), formatYoy(yoy.total_won), "kpi-yoy") +
      "</div>" +
      kpiCard("Average deal size", formatMillions(data.average_deal_size)) +
      "</div>";
  }

  function indexStageTotals(rows) {
    const byStage = {};
    (rows || []).forEach(function (row) {
      const name = row && row.stage != null ? String(row.stage) : "";
      byStage[name] = {
        count: Number(row.count) || 0,
        amount: Number(row.amount) || 0,
      };
    });
    return FUNNEL_STAGES.map(function (stage) {
      const found = byStage[stage] || { count: 0, amount: 0 };
      return { stage: stage, count: found.count, amount: found.amount };
    });
  }

  function funnelSummary(rows) {
    return rows
      .map(function (row) {
        return (
          row.stage +
          " " +
          formatCount(row.count) +
          " opportunities, " +
          formatMillions(row.amount)
        );
      })
      .join("; ");
  }

  function stageBarLabelPlugin() {
    return {
      id: "stageBarLabels",
      afterDatasetsDraw: function (chart) {
        if (chart.data.datasets.length > 1) return;
        const ctx = chart.ctx;
        const dataset = chart.data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        ctx.save();
        ctx.font = "12px Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
        ctx.fillStyle = CHART_LABEL_COLOR;
        ctx.textBaseline = "middle";
        meta.data.forEach(function (bar, i) {
          const text = formatCount(dataset.counts[i]) + " · " + formatMillions(dataset.data[i]);
          ctx.fillText(text, bar.x + 8, bar.y);
        });
        ctx.restore();
      },
    };
  }

  function drawStageFunnelChart(canvas, view, partnerRows, dcmRows) {
    if (typeof Chart === "undefined") {
      return false;
    }
    if (stageFunnelChart) {
      stageFunnelChart.destroy();
      stageFunnelChart = null;
    }

    const datasets = [];
    if (view === "dcm") {
      datasets.push({
        label: "DCM D&T",
        data: dcmRows.map(function (row) {
          return row.amount;
        }),
        counts: dcmRows.map(function (row) {
          return row.count;
        }),
        backgroundColor: DCM_BAR_COLOR,
        borderSkipped: false,
        borderRadius: 4,
        barThickness: 22,
      });
    } else if (view === "compare") {
      datasets.push({
        label: "All Pipeline",
        data: partnerRows.map(function (row) {
          return row.amount;
        }),
        counts: partnerRows.map(function (row) {
          return row.count;
        }),
        backgroundColor: PARTNER_BAR_COLOR,
        borderSkipped: false,
        borderRadius: 4,
        barThickness: 14,
      });
      datasets.push({
        label: "DCM D&T",
        data: dcmRows.map(function (row) {
          return row.amount;
        }),
        counts: dcmRows.map(function (row) {
          return row.count;
        }),
        backgroundColor: DCM_BAR_COLOR,
        borderSkipped: false,
        borderRadius: 4,
        barThickness: 14,
      });
    } else {
      datasets.push({
        label: "All Pipeline",
        data: partnerRows.map(function (row) {
          return row.amount;
        }),
        counts: partnerRows.map(function (row) {
          return row.count;
        }),
        backgroundColor: PARTNER_BAR_COLOR,
        borderSkipped: false,
        borderRadius: 4,
        barThickness: 22,
      });
    }

    let ariaLabel =
      "All Pipeline by stage: " + funnelSummary(partnerRows);
    if (view === "dcm") {
      ariaLabel = "DCM D&T pipeline by stage: " + funnelSummary(dcmRows);
    } else if (view === "compare") {
      ariaLabel =
        "Side-by-side comparison of All Pipeline and DCM D&T by stage. All Pipeline: " +
        funnelSummary(partnerRows) +
        ". DCM D&T: " +
        funnelSummary(dcmRows);
    }
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", ariaLabel);

    stageFunnelChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: FUNNEL_STAGES,
        datasets: datasets,
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: view === "compare",
            position: "top",
            align: "end",
            labels: { boxWidth: 12, font: { size: 12 } },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const count = ctx.dataset.counts[ctx.dataIndex];
                return (
                  ctx.dataset.label +
                  ": " +
                  formatCount(count) +
                  " opportunities, " +
                  formatMillions(ctx.parsed.x)
                );
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: CHART_GRID_COLOR },
            ticks: {
              callback: function (value) {
                return formatMillions(value);
              },
            },
          },
          y: {
            grid: { display: false },
          },
        },
        layout: {
          padding: { right: view === "compare" ? 8 : 88 },
        },
      },
      plugins: [stageBarLabelPlugin()],
    });
    return true;
  }

  function renderStageFunnel(stageTotals) {
    const body = sectionBody("stage-funnel");
    if (!body) return;

    const source = stageTotals || {};
    const partnerRows = indexStageTotals(source.partner_stage_totals);
    const dcmRows = indexStageTotals(source.dcm_stage_totals);

    body.innerHTML =
      '<div class="chart-toolbar" role="group" aria-label="Stage funnel source">' +
      '<button type="button" class="toggle-btn is-active" data-funnel-view="partner" aria-pressed="true">All Pipeline</button>' +
      '<button type="button" class="toggle-btn" data-funnel-view="dcm" aria-pressed="false">DCM D&T</button>' +
      '<button type="button" class="toggle-btn" data-funnel-view="compare" aria-pressed="false">Compare</button>' +
      "</div>" +
      '<div class="chart-wrap">' +
      '<canvas id="stage-funnel-chart" role="img" aria-label="All Pipeline stage funnel"></canvas>' +
      "</div>";

    const canvas = document.getElementById("stage-funnel-chart");
    const drawn = drawStageFunnelChart(canvas, "partner", partnerRows, dcmRows);
    if (!drawn) {
      setPlaceholder(
        "stage-funnel",
        "Chart.js failed to load, so the stage funnel cannot be shown."
      );
      return;
    }

    body.querySelector(".chart-toolbar").addEventListener("click", function (event) {
      const button = event.target.closest("[data-funnel-view]");
      if (!button) return;
      body.querySelectorAll(".toggle-btn").forEach(function (btn) {
        const active = btn === button;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      drawStageFunnelChart(canvas, button.getAttribute("data-funnel-view"), partnerRows, dcmRows);
    });
  }

  function formatCloseDate(iso) {
    if (!iso) return "—";
    const parsed = new Date(String(iso) + "T00:00:00");
    if (Number.isNaN(parsed.getTime())) return String(iso);
    return parsed.toLocaleDateString(undefined, { dateStyle: "medium" });
  }

  function compareOpps(a, b, key, dir) {
    var av = a[key];
    var bv = b[key];
    var cmp = 0;
    if (key === "amount") {
      cmp = (Number(av) || 0) - (Number(bv) || 0);
    } else if (key === "close_date") {
      cmp = String(av || "").localeCompare(String(bv || ""));
    } else {
      cmp = String(av || "").toLowerCase().localeCompare(String(bv || "").toLowerCase());
    }
    return dir === "desc" ? -cmp : cmp;
  }

  function renderOppsTable(containerId, opps, title) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var rows = Array.isArray(opps) ? opps.slice() : [];
    var sortKey = "amount";
    var sortDir = "desc";
    var columns = [
      { key: "name", label: "Opportunity Name", cls: "" },
      { key: "partner", label: "Partner", cls: "" },
      { key: "stage", label: "Stage", cls: "" },
      { key: "amount", label: "Amount", cls: "num" },
      { key: "close_date", label: "Close Date", cls: "" },
    ];

    function paint() {
      rows.sort(function (a, b) {
        return compareOpps(a, b, sortKey, sortDir);
      });

      var head = columns
        .map(function (col) {
          var aria =
            col.key === sortKey
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none";
          return (
            '<th scope="col" class="' +
            col.cls +
            '" data-sort-key="' +
            col.key +
            '" aria-sort="' +
            aria +
            '">' +
            escapeHtml(col.label) +
            "</th>"
          );
        })
        .join("");

      var body;
      if (!rows.length) {
        body =
          '<tr><td class="empty-row" colspan="5">No opportunities in this list.</td></tr>';
      } else {
        body = rows
          .map(function (row) {
            return (
              "<tr>" +
              "<td>" +
              escapeHtml(row.name || "") +
              "</td>" +
              "<td>" +
              escapeHtml(row.partner || "") +
              "</td>" +
              "<td>" +
              escapeHtml(row.stage || "") +
              "</td>" +
              '<td class="num">' +
              escapeHtml(formatMillions(row.amount)) +
              "</td>" +
              "<td>" +
              escapeHtml(formatCloseDate(row.close_date)) +
              "</td>" +
              "</tr>"
            );
          })
          .join("");
      }

      container.innerHTML =
        '<div class="table-wrap">' +
        '<table class="data-table">' +
        "<caption>" +
        escapeHtml(title) +
        " (" +
        formatCount(rows.length) +
        ")</caption>" +
        "<thead><tr>" +
        head +
        "</tr></thead>" +
        "<tbody>" +
        body +
        "</tbody>" +
        "</table>" +
        "</div>";

      container.querySelectorAll("th[data-sort-key]").forEach(function (th) {
        th.addEventListener("click", function () {
          var key = th.getAttribute("data-sort-key");
          if (sortKey === key) {
            sortDir = sortDir === "asc" ? "desc" : "asc";
          } else {
            sortKey = key;
            sortDir = key === "amount" ? "desc" : "asc";
          }
          paint();
        });
      });
    }

    paint();
  }

  function renderOppsBySize(payload) {
    var body = sectionBody("large-opps");
    if (!body) return;

    var source = payload || {};
    var opps = Array.isArray(source.all_open_opportunities)
      ? source.all_open_opportunities
      : [];
    var maxAmount = Number(source.max_open_opportunity_amount);
    if (!Number.isFinite(maxAmount) || maxAmount < 0) {
      maxAmount = 0;
      opps.forEach(function (row) {
        var amt = Number(row.amount) || 0;
        if (amt > maxAmount) maxAmount = amt;
      });
    }
    if (maxAmount <= 0) maxAmount = 1;

    var threshold = 0;
    var sortKey = "amount";
    var sortDir = "desc";
    var columns = [
      { key: "name", label: "Opportunity Name", cls: "" },
      { key: "partner", label: "Partner", cls: "" },
      { key: "account", label: "Account", cls: "" },
      { key: "stage", label: "Stage", cls: "" },
      { key: "amount", label: "Amount", cls: "num" },
      { key: "close_date", label: "Close Date", cls: "" },
    ];

    body.innerHTML =
      '<div class="size-slider-row">' +
      '<label for="min-deal-size">Minimum deal size</label>' +
      '<input id="min-deal-size" type="range" min="0" max="' +
      escapeHtml(String(Math.ceil(maxAmount))) +
      '" step="100000" value="0" aria-valuemin="0" aria-valuemax="' +
      escapeHtml(String(Math.ceil(maxAmount))) +
      '" aria-valuenow="0" />' +
      '<span id="min-deal-size-value" class="size-threshold">' +
      escapeHtml(formatMillions(0)) +
      "</span>" +
      "</div>" +
      '<p id="size-filter-summary" class="size-summary"></p>' +
      '<div id="size-opps-table"></div>';

    var slider = document.getElementById("min-deal-size");
    var valueLabel = document.getElementById("min-deal-size-value");
    var summary = document.getElementById("size-filter-summary");
    var tableHost = document.getElementById("size-opps-table");

    function filteredRows() {
      return opps
        .filter(function (row) {
          return (Number(row.amount) || 0) >= threshold;
        })
        .slice()
        .sort(function (a, b) {
          return compareOpps(a, b, sortKey, sortDir);
        });
    }

    function paint() {
      var rows = filteredRows();
      var total = 0;
      rows.forEach(function (row) {
        total += Number(row.amount) || 0;
      });
      if (valueLabel) valueLabel.textContent = formatMillions(threshold);
      if (slider) {
        slider.setAttribute("aria-valuenow", String(threshold));
        slider.setAttribute(
          "aria-valuetext",
          formatMillions(threshold) + " minimum deal size"
        );
      }
      if (summary) {
        summary.textContent =
          formatCount(rows.length) +
          " open opportunities totaling " +
          formatMillions(total) +
          " at or above " +
          formatMillions(threshold);
      }

      var head = columns
        .map(function (col) {
          var aria =
            col.key === sortKey
              ? sortDir === "asc"
                ? "ascending"
                : "descending"
              : "none";
          return (
            '<th scope="col" class="' +
            col.cls +
            '" data-sort-key="' +
            col.key +
            '" aria-sort="' +
            aria +
            '">' +
            escapeHtml(col.label) +
            "</th>"
          );
        })
        .join("");

      var tbody;
      if (!rows.length) {
        tbody =
          '<tr><td class="empty-row" colspan="6">No open opportunities at or above this threshold.</td></tr>';
      } else {
        tbody = rows
          .map(function (row) {
            return (
              "<tr>" +
              "<td>" +
              escapeHtml(row.name || "") +
              "</td>" +
              "<td>" +
              escapeHtml(row.partner || "") +
              "</td>" +
              "<td>" +
              escapeHtml(row.account || "—") +
              "</td>" +
              "<td>" +
              escapeHtml(row.stage || "") +
              "</td>" +
              '<td class="num">' +
              escapeHtml(formatMillions(row.amount)) +
              "</td>" +
              "<td>" +
              escapeHtml(formatCloseDate(row.close_date)) +
              "</td>" +
              "</tr>"
            );
          })
          .join("");
      }

      tableHost.innerHTML =
        '<div class="table-wrap"><table class="data-table">' +
        "<thead><tr>" +
        head +
        "</tr></thead><tbody>" +
        tbody +
        "</tbody></table></div>";

      tableHost.querySelectorAll("th[data-sort-key]").forEach(function (th) {
        th.addEventListener("click", function () {
          var key = th.getAttribute("data-sort-key");
          if (sortKey === key) {
            sortDir = sortDir === "asc" ? "desc" : "asc";
          } else {
            sortKey = key;
            sortDir = key === "amount" ? "desc" : "asc";
          }
          paint();
        });
      });
    }

    slider.addEventListener("input", function () {
      threshold = Number(slider.value) || 0;
      paint();
    });

    paint();
  }

  const rankingCharts = {};

  function rankingBarLabelPlugin() {
    return {
      id: "rankingBarLabels",
      afterDatasetsDraw: function (chart) {
        const ctx = chart.ctx;
        const dataset = chart.data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        ctx.save();
        ctx.font = "11px Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
        ctx.fillStyle = CHART_LABEL_COLOR;
        ctx.textBaseline = "middle";
        meta.data.forEach(function (bar, i) {
          const text = formatMillions(dataset.data[i]);
          ctx.fillText(text, bar.x + 8, bar.y);
        });
        ctx.restore();
      },
    };
  }

  function drawRankingChart(canvasId, rows, color, onBarClick) {
    if (typeof Chart === "undefined") return false;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return false;

    if (rankingCharts[canvasId]) {
      rankingCharts[canvasId].destroy();
      rankingCharts[canvasId] = null;
    }

    const labels = rows.map(function (row) {
      return row.label;
    });
    const amounts = rows.map(function (row) {
      return row.amount;
    });
    const counts = rows.map(function (row) {
      return row.count;
    });

    rankingCharts[canvasId] = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            data: amounts,
            counts: counts,
            backgroundColor: Array.isArray(color) ? color : color,
            borderSkipped: false,
            borderRadius: 4,
            barThickness: rows.length > 14 ? 12 : 16,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return (
                  formatMillions(ctx.parsed.x) +
                  " · " +
                  formatCount(ctx.dataset.counts[ctx.dataIndex]) +
                  " opportunities"
                );
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: CHART_GRID_COLOR },
            ticks: {
              callback: function (value) {
                return formatMillions(value);
              },
            },
          },
          y: {
            grid: { display: false },
            ticks: { autoSkip: false, font: { size: 11 } },
          },
        },
        layout: { padding: { right: 56 } },
        onClick: onBarClick
          ? function (_evt, elements) {
              if (!elements.length) return;
              var idx = elements[0].index;
              if (rows[idx]) onBarClick(rows[idx].label);
            }
          : undefined,
      },
      plugins: [rankingBarLabelPlugin()],
    });
    return true;
  }

  function sortedRankingRows(items, labelKey) {
    return (items || [])
      .slice()
      .sort(function (a, b) {
        return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      })
      .map(function (row) {
        return {
          label: row[labelKey] || "(blank)",
          amount: Number(row.amount) || 0,
          count: Number(row.count) || 0,
        };
      });
  }

  function rankingAria(title, rows) {
    return (
      title +
      ", sorted descending by amount: " +
      rows
        .map(function (row) {
          return row.label + " " + formatMillions(row.amount);
        })
        .join("; ")
    );
  }

  function renderPartnerRanking(partnerTotals) {
    const container = document.getElementById("partner-ranking-chart");
    if (!container) return;
    const rows = sortedRankingRows(partnerTotals, "partner");
    container.innerHTML =
      "<h3>By All Pipeline name</h3>" +
      '<div class="chart-wrap ranking-wrap">' +
      '<canvas id="partner-ranking-canvas" role="img" aria-label="' +
      escapeHtml(rankingAria("Pipeline amount by All Pipeline name", rows)) +
      '"></canvas>' +
      "</div>";
    if (!drawRankingChart("partner-ranking-canvas", rows, PARTNER_BAR_COLOR)) {
      setPlaceholder(
        "partner-ranking-chart",
        "Chart.js failed to load, so partner ranking cannot be shown."
      );
    }
  }

  function renderPartnerCodeRanking(partnerCodeTotals) {
    const container = document.getElementById("partner-code-chart");
    if (!container) return;
    const rows = sortedRankingRows(partnerCodeTotals, "product_code");
    container.innerHTML =
      "<h3>By All Pipeline/product code</h3>" +
      '<div class="chart-wrap ranking-wrap">' +
      '<canvas id="partner-code-canvas" role="img" aria-label="' +
      escapeHtml(rankingAria("Pipeline amount by All Pipeline product code", rows)) +
      '"></canvas>' +
      "</div>";
    if (!drawRankingChart("partner-code-canvas", rows, DCM_BAR_COLOR)) {
      setPlaceholder(
        "partner-code-chart",
        "Chart.js failed to load, so product-code ranking cannot be shown."
      );
    }
  }

  const PRODUCT_BREAKDOWN_KEYS = ["USH16", "USH17", "USG18", "No D&A"];
  let productBreakdownData = {};
  let selectedProductCode = "USH16";

  function productBlock(code) {
    return (productBreakdownData && productBreakdownData[code]) || {
      total: 0,
      count: 0,
      opportunities: [],
      partner_totals: [],
    };
  }

  function productRankingRows() {
    return PRODUCT_BREAKDOWN_KEYS.map(function (code) {
      var block = productBlock(code);
      return {
        label: code,
        amount: Number(block.total) || 0,
        count: Number(block.count) || 0,
      };
    }).sort(function (a, b) {
      var delta = b.amount - a.amount;
      if (delta) return delta;
      return PRODUCT_BREAKDOWN_KEYS.indexOf(a.label) - PRODUCT_BREAKDOWN_KEYS.indexOf(b.label);
    });
  }

  function defaultProductCode() {
    for (var i = 0; i < PRODUCT_BREAKDOWN_KEYS.length; i++) {
      var code = PRODUCT_BREAKDOWN_KEYS[i];
      if ((Number(productBlock(code).count) || 0) > 0) return code;
    }
    return PRODUCT_BREAKDOWN_KEYS[0];
  }

  function productBarColors(rows) {
    return rows.map(function (row) {
      return row.label === "No D&A" ? DCM_BAR_COLOR : PARTNER_BAR_COLOR;
    });
  }

  function renderProductRankingChart() {
    var body = sectionBody("product-ranking");
    if (!body) return;
    var rows = productRankingRows();
    body.innerHTML =
      '<p class="size-summary">Open pipeline $ by product code. Opportunities whose code is missing, blank, or not USH16 / USH17 / USG18 are grouped as No D&amp;A. Click a bar to filter the breakdown.</p>' +
      '<div class="chart-wrap product-rank-wrap">' +
      '<canvas id="product-ranking-canvas" role="img" aria-label="' +
      escapeHtml(rankingAria("Open pipeline amount by product code", rows)) +
      '"></canvas>' +
      "</div>";
    if (
      !drawRankingChart("product-ranking-canvas", rows, productBarColors(rows), function (label) {
        paintProductBreakdown(label);
      })
    ) {
      setPlaceholder(
        "product-ranking",
        "Chart.js failed to load, so product ranking cannot be shown."
      );
    }
  }

  function setProductCodeTabState(code) {
    var toolbar = document.getElementById("product-code-tabs");
    if (!toolbar) return;
    toolbar.querySelectorAll("[data-product-code]").forEach(function (btn) {
      var active = btn.getAttribute("data-product-code") === code;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function renderProductOppsTable(container, opps) {
    var rows = Array.isArray(opps) ? opps.slice() : [];
    var sortKey = "amount";
    var sortDir = "desc";
    var columns = [
      { key: "name", label: "Opportunity Name", cls: "" },
      { key: "partner", label: "Partner", cls: "" },
      { key: "account", label: "Account", cls: "" },
      { key: "stage", label: "Stage", cls: "" },
      { key: "amount", label: "Amount", cls: "num" },
      { key: "close_date", label: "Close Date", cls: "" },
    ];

    function paint() {
      rows.sort(function (a, b) {
        return compareOpps(a, b, sortKey, sortDir);
      });
      var head = columns
        .map(function (col) {
          var aria =
            col.key === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none";
          return (
            '<th scope="col" class="' +
            col.cls +
            '" data-sort-key="' +
            col.key +
            '" aria-sort="' +
            aria +
            '">' +
            escapeHtml(col.label) +
            "</th>"
          );
        })
        .join("");
      var body;
      if (!rows.length) {
        body =
          '<tr><td class="empty-row" colspan="6">No open opportunities for this product code.</td></tr>';
      } else {
        body = rows
          .map(function (row) {
            return (
              "<tr>" +
              "<td>" +
              escapeHtml(row.name || "") +
              "</td>" +
              "<td>" +
              escapeHtml(row.partner || "") +
              "</td>" +
              "<td>" +
              escapeHtml(row.account || "—") +
              "</td>" +
              "<td>" +
              escapeHtml(row.stage || "") +
              "</td>" +
              '<td class="num">' +
              escapeHtml(formatMillions(row.amount)) +
              "</td>" +
              "<td>" +
              escapeHtml(formatCloseDate(row.close_date)) +
              "</td>" +
              "</tr>"
            );
          })
          .join("");
      }
      container.innerHTML =
        '<div class="table-wrap"><table class="data-table">' +
        "<caption>Opportunities (" +
        formatCount(rows.length) +
        ")</caption>" +
        "<thead><tr>" +
        head +
        "</tr></thead><tbody>" +
        body +
        "</tbody></table></div>";
      container.querySelectorAll("th[data-sort-key]").forEach(function (th) {
        th.addEventListener("click", function () {
          var key = th.getAttribute("data-sort-key");
          if (sortKey === key) {
            sortDir = sortDir === "asc" ? "desc" : "asc";
          } else {
            sortKey = key;
            sortDir = key === "amount" ? "desc" : "asc";
          }
          paint();
        });
      });
    }

    paint();
  }

  function paintProductBreakdown(code) {
    if (PRODUCT_BREAKDOWN_KEYS.indexOf(code) === -1) {
      code = defaultProductCode();
    }
    selectedProductCode = code;
    setProductCodeTabState(code);

    var block = productBlock(code);
    var summary = document.getElementById("product-breakdown-summary");
    if (summary) {
      summary.textContent =
        formatCount(block.count) +
        " open opportunities totaling " +
        formatMillions(block.total) +
        " for " +
        code;
    }

    var tableHost = document.getElementById("product-opps-table");
    if (tableHost) renderProductOppsTable(tableHost, block.opportunities);

    var partnerHost = document.getElementById("product-partner-chart");
    if (!partnerHost) return;

    var partnerRows = sortedRankingRows(block.partner_totals, "partner");
    if (rankingCharts["product-partner-canvas"]) {
      rankingCharts["product-partner-canvas"].destroy();
      rankingCharts["product-partner-canvas"] = null;
    }
    if (!partnerRows.length) {
      partnerHost.innerHTML =
        '<p class="placeholder">No partners currently working this product code.</p>';
      return;
    }
    partnerHost.innerHTML =
      '<div class="chart-wrap product-partner-wrap">' +
      '<canvas id="product-partner-canvas" role="img" aria-label="' +
      escapeHtml(rankingAria("Open pipeline amount by partner for " + code, partnerRows)) +
      '"></canvas>' +
      "</div>";
    drawRankingChart("product-partner-canvas", partnerRows, PARTNER_BAR_COLOR);
  }

  function renderProductTab(breakdown) {
    productBreakdownData = breakdown || {};
    selectedProductCode = defaultProductCode();
    renderProductRankingChart();

    var body = sectionBody("product-breakdown");
    if (!body) return;

    var buttons = PRODUCT_BREAKDOWN_KEYS.map(function (code) {
      var block = productBlock(code);
      return (
        '<button type="button" class="toggle-btn" role="tab" data-product-code="' +
        escapeHtml(code) +
        '" aria-selected="false">' +
        escapeHtml(code) +
        " (" +
        formatCount(block.count) +
        ")</button>"
      );
    }).join("");

    body.innerHTML =
      '<div id="product-code-tabs" class="chart-toolbar" role="tablist" aria-label="Product code">' +
      buttons +
      "</div>" +
      '<p id="product-breakdown-summary" class="size-summary"></p>' +
      '<div class="product-split">' +
      "<div>" +
      '<h3 class="subsection-title">Opportunities</h3>' +
      '<div id="product-opps-table"></div>' +
      "</div>" +
      "<div>" +
      '<h3 class="subsection-title">Partners</h3>' +
      '<div id="product-partner-chart"></div>' +
      "</div>" +
      "</div>";

    var toolbar = document.getElementById("product-code-tabs");
    if (toolbar) {
      toolbar.addEventListener("click", function (event) {
        var button = event.target.closest("[data-product-code]");
        if (!button) return;
        paintProductBreakdown(button.getAttribute("data-product-code"));
      });
    }

    paintProductBreakdown(selectedProductCode);
  }

  function renderIndustryMix(industryTotals) {
    const body = sectionBody("industry-mix-chart");
    if (!body) return;

    const source = industryTotals || {};
    const dcmRows = sortedRankingRows(source.dcm, "industry");
    const partnerRows = sortedRankingRows(source.partner, "industry");
    const colorByIndustry = industryColorMap(
      dcmRows.concat(partnerRows).map(function (row) {
        return row.label;
      })
    );
    const dcmColors = dcmRows.map(function (row) {
      return colorByIndustry[row.label];
    });
    const partnerColors = partnerRows.map(function (row) {
      return colorByIndustry[row.label];
    });

    body.innerHTML =
      '<div class="ranking-panel">' +
      "<h3>DCM D&T</h3>" +
      '<div class="chart-wrap industry-wrap">' +
      '<canvas id="industry-dcm-canvas" role="img" aria-label="' +
      escapeHtml(rankingAria("DCM D&T pipeline by industry", dcmRows)) +
      '"></canvas>' +
      "</div>" +
      "</div>" +
      '<div class="ranking-panel">' +
      "<h3>All Pipeline</h3>" +
      '<div class="chart-wrap industry-wrap">' +
      '<canvas id="industry-partner-canvas" role="img" aria-label="' +
      escapeHtml(rankingAria("All Pipeline by industry", partnerRows)) +
      '"></canvas>' +
      "</div>" +
      "</div>";

    const dcmOk = drawRankingChart("industry-dcm-canvas", dcmRows, dcmColors);
    const partnerOk = drawRankingChart("industry-partner-canvas", partnerRows, partnerColors);
    if (!dcmOk && !partnerOk) {
      setPlaceholder(
        "industry-mix-chart",
        "Chart.js failed to load, so industry mix cannot be shown."
      );
    }
  }

  const INDUSTRY_PALETTE = CHART_PALETTE;

  function industryColorMap(names) {
    const unique = [];
    (names || []).forEach(function (name) {
      if (unique.indexOf(name) === -1) unique.push(name);
    });
    unique.sort();
    const map = {};
    unique.forEach(function (name, i) {
      map[name] = INDUSTRY_PALETTE[i % INDUSTRY_PALETTE.length];
    });
    return map;
  }

  function formatPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return (n * 100).toFixed(1) + "%";
  }

  function renderTopAccounts(topAccounts) {
    const body = sectionBody("top-accounts-chart");
    if (!body) return;

    const source = topAccounts || {};
    const rows = sortedRankingRows(source.top_15, "account");
    const pct = formatPercent(source.top_5_pct_of_pipeline);
    const top5 = formatMillions(source.top_5_amount);
    const total = formatMillions(source.pipeline_total);

    body.innerHTML =
      '<div class="callout">' +
      '<p class="callout-value">' +
      escapeHtml(pct) +
      "</p>" +
      '<p class="callout-label">Top 5 accounts represent ' +
      escapeHtml(pct) +
      " of pipeline (" +
      escapeHtml(top5) +
      " of " +
      escapeHtml(total) +
      ")</p>" +
      "</div>" +
      '<div class="chart-wrap accounts-wrap">' +
      '<canvas id="top-accounts-canvas" role="img" aria-label="' +
      escapeHtml(
        "Top 5 accounts are " +
          pct +
          " of pipeline. Top 15 by amount: " +
          rankingAria("accounts", rows)
      ) +
      '"></canvas>' +
      "</div>";

    if (!drawRankingChart("top-accounts-canvas", rows, PARTNER_BAR_COLOR)) {
      setPlaceholder(
        "top-accounts-chart",
        "Chart.js failed to load, so top accounts cannot be shown."
      );
    }
  }

  function tableRowsOrEmpty(rowsHtml, colspan) {
    if (rowsHtml) return rowsHtml;
    return (
      '<tr><td class="empty-row" colspan="' +
      colspan +
      '">None in this extract.</td></tr>'
    );
  }

  function renderReconciliation(recon) {
    var body = sectionBody("reconciliation");
    if (!body) return;
    var data = recon || {};
    var rows = Array.isArray(data.missing_from_dcm) ? data.missing_from_dcm.slice() : [];
    var count = Number(data.count);
    if (!Number.isFinite(count)) count = rows.length;
    var total = Number(data.total);
    if (!Number.isFinite(total)) {
      total = 0;
      rows.forEach(function (row) {
        total += Number(row.amount) || 0;
      });
    }

    var sortKey = "amount";
    var sortDir = "desc";
    var columns = [
      { key: "name", label: "Opportunity Name", cls: "" },
      { key: "partners", label: "Named partners", cls: "" },
      { key: "account", label: "Account", cls: "" },
      { key: "stage", label: "Stage", cls: "" },
      { key: "amount", label: "Amount", cls: "num" },
      { key: "close_date", label: "Close Date", cls: "" },
    ];

    function partnerText(row) {
      if (Array.isArray(row.partners)) return row.partners.join(", ");
      return row.partners || "";
    }

    function compareRecon(a, b, key, dir) {
      var av;
      var bv;
      if (key === "partners") {
        av = partnerText(a);
        bv = partnerText(b);
      } else {
        av = a[key];
        bv = b[key];
      }
      var mul = dir === "asc" ? 1 : -1;
      if (key === "amount") {
        return ((Number(av) || 0) - (Number(bv) || 0)) * mul;
      }
      return String(av || "").localeCompare(String(bv || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * mul;
    }

    function paintTable() {
      rows.sort(function (a, b) {
        return compareRecon(a, b, sortKey, sortDir);
      });
      var head = columns
        .map(function (col) {
          var aria =
            col.key === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none";
          return (
            '<th scope="col" class="' +
            col.cls +
            '" data-sort-key="' +
            col.key +
            '" aria-sort="' +
            aria +
            '">' +
            escapeHtml(col.label) +
            "</th>"
          );
        })
        .join("");
      var tbody;
      if (!rows.length) {
        tbody =
          '<tr><td class="empty-row" colspan="6">No named-partner opportunities are missing from the DCM D&amp;T extract.</td></tr>';
      } else {
        tbody = rows
          .map(function (row) {
            return (
              "<tr>" +
              "<td>" +
              escapeHtml(row.name || "") +
              "</td>" +
              "<td>" +
              escapeHtml(partnerText(row) || "—") +
              "</td>" +
              "<td>" +
              escapeHtml(row.account || "—") +
              "</td>" +
              "<td>" +
              escapeHtml(row.stage || "") +
              "</td>" +
              '<td class="num">' +
              escapeHtml(formatMillions(row.amount)) +
              "</td>" +
              "<td>" +
              escapeHtml(formatCloseDate(row.close_date)) +
              "</td>" +
              "</tr>"
            );
          })
          .join("");
      }
      var host = document.getElementById("recon-opps-table");
      if (!host) return;
      host.innerHTML =
        '<div class="table-wrap"><table class="data-table">' +
        "<thead><tr>" +
        head +
        "</tr></thead><tbody>" +
        tbody +
        "</tbody></table></div>";
      host.querySelectorAll("th[data-sort-key]").forEach(function (th) {
        th.addEventListener("click", function () {
          var key = th.getAttribute("data-sort-key");
          if (sortKey === key) {
            sortDir = sortDir === "asc" ? "desc" : "asc";
          } else {
            sortKey = key;
            sortDir = key === "amount" ? "desc" : "asc";
          }
          paintTable();
        });
      });
    }

    body.innerHTML =
      '<p class="recon-stat">' +
      escapeHtml(formatCount(count)) +
      " opportunities totaling " +
      escapeHtml(formatMillions(total)) +
      "</p>" +
      '<p class="recon-note">These opportunities are logged under a DCM D&amp;T partner in the All Pipeline view but don\'t appear in the DCM D&amp;T extract - review whether they should be added.</p>' +
      '<div id="recon-opps-table"></div>';
    paintTable();
  }

  const FY_MONTH_ORDER = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
  const MONTH_LABELS = [
    "",
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let trendChart = null;

  function formatFyMonthLabel(yyyyMm) {
    const parts = String(yyyyMm || "").split("-");
    const year = parts[0] || "";
    const month = Number(parts[1]);
    const name = MONTH_LABELS[month] || yyyyMm;
    return year ? name + " " + year : name;
  }

  function orderedFyMonths(trend) {
    const rows = (trend && trend.by_month) || [];
    const byKey = {};
    rows.forEach(function (row) {
      byKey[row.month] = row;
    });

    var start = trend && trend.fiscal_year_start;
    var year = start ? Number(String(start).slice(0, 4)) : null;
    if (!year && rows.length) {
      var first = String(rows[0].month || "");
      var m = Number(first.slice(5, 7));
      var y = Number(first.slice(0, 4));
      year = m >= 7 ? y : y - 1;
    }
    if (!year) year = new Date().getFullYear();

    return FY_MONTH_ORDER.map(function (monthNum) {
      var y = monthNum >= 7 ? year : year + 1;
      var key = y + "-" + String(monthNum).padStart(2, "0");
      var found = byKey[key] || {};
      return {
        month: key,
        amount: Number(found.amount) || 0,
        cumulative_won: Number(found.cumulative_won) || 0,
      };
    });
  }

  function renderTrend(trend) {
    const body = sectionBody("trend-chart");
    if (!body) return;
    const rows = orderedFyMonths(trend || {});
    const labels = rows.map(function (row) {
      return formatFyMonthLabel(row.month);
    });
    const pipeline = rows.map(function (row) {
      return row.amount;
    });
    const cumulativeWon = rows.map(function (row) {
      return row.cumulative_won;
    });
    const fyStart = trend && trend.fiscal_year_start ? trend.fiscal_year_start : "";
    const fyEnd = trend && trend.fiscal_year_end ? trend.fiscal_year_end : "";

    body.innerHTML =
      '<div class="chart-wrap trend-wrap">' +
      '<canvas id="trend-canvas" role="img" aria-label="' +
      escapeHtml(
        "Fiscal-year close-date trend from July through June. Monthly pipeline dollars and cumulative won dollars."
      ) +
      '"></canvas>' +
      "</div>";

    if (typeof Chart === "undefined") {
      setPlaceholder("trend-chart", "Chart.js failed to load, so the trend chart cannot be shown.");
      return;
    }

    const canvas = document.getElementById("trend-canvas");
    if (trendChart) {
      trendChart.destroy();
      trendChart = null;
    }

    trendChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Pipeline $ closing that month",
            data: pipeline,
            borderColor: PARTNER_BAR_COLOR,
            backgroundColor: CHART_FILL_PRIMARY,
            tension: 0.2,
            fill: false,
            pointRadius: 3,
          },
          {
            label: "Cumulative Won $",
            data: cumulativeWon,
            borderColor: DCM_BAR_COLOR,
            backgroundColor: CHART_FILL_COMPARE,
            tension: 0.2,
            fill: false,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true, position: "top", align: "end" },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ": " + formatMillions(ctx.parsed.y);
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            title: {
              display: true,
              text:
                "Fiscal year" +
                (fyStart && fyEnd ? " (" + fyStart + " to " + fyEnd + ")" : " (Jul–Jun)"),
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: CHART_GRID_COLOR },
            ticks: {
              callback: function (value) {
                return formatMillions(value);
              },
            },
          },
        },
      },
    });
  }

  const AGING_BUCKETS = ["0-90", "91-180", "181-365", "365+"];
  let agingChart = null;

  function renderAging(aging) {
    const body = sectionBody("aging-histogram");
    if (!body) return;
    const source = aging || {};
    const byBucket = {};
    (source.buckets || []).forEach(function (row) {
      byBucket[row.bucket] = row;
    });
    const labels = AGING_BUCKETS.slice();
    const counts = labels.map(function (bucket) {
      return byBucket[bucket] ? Number(byBucket[bucket].count) || 0 : 0;
    });
    const amounts = labels.map(function (bucket) {
      return byBucket[bucket] ? Number(byBucket[bucket].amount) || 0 : 0;
    });
    const oldest = source.oldest || [];

    const oldestRows = oldest
      .map(function (row) {
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(row.name || "") +
          "</td>" +
          "<td>" +
          escapeHtml(row.partner || "") +
          "</td>" +
          "<td>" +
          escapeHtml(row.stage || "") +
          "</td>" +
          '<td class="num">' +
          escapeHtml(formatMillions(row.amount)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatCloseDate(row.created_date)) +
          "</td>" +
          '<td class="num">' +
          escapeHtml(formatCount(row.age_days)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    body.innerHTML =
      '<div class="chart-wrap aging-wrap">' +
      '<canvas id="aging-canvas" role="img" aria-label="' +
      escapeHtml(
        "Open opportunity aging histogram in days: " +
          labels
            .map(function (label, i) {
              return label + " days, " + formatCount(counts[i]) + " opportunities";
            })
            .join("; ")
      ) +
      '"></canvas>' +
      "</div>" +
      '<h3 class="subsection-title">10 oldest open opportunities</h3>' +
      '<div class="table-wrap"><table class="data-table">' +
      "<thead><tr>" +
      "<th>Opportunity Name</th><th>Partner</th><th>Stage</th>" +
      '<th class="num">Amount</th><th>Created Date</th><th class="num">Age (days)</th>' +
      "</tr></thead><tbody>" +
      tableRowsOrEmpty(oldestRows, 6) +
      "</tbody></table></div>";

    if (typeof Chart === "undefined") {
      setPlaceholder("aging-histogram", "Chart.js failed to load, so aging cannot be shown.");
      return;
    }

    const canvas = document.getElementById("aging-canvas");
    if (agingChart) {
      agingChart.destroy();
      agingChart = null;
    }

    agingChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Open opportunities",
            data: counts,
            amounts: amounts,
            backgroundColor: PARTNER_BAR_COLOR,
            borderSkipped: false,
            borderRadius: 4,
            barPercentage: 0.7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return (
                  formatCount(ctx.parsed.y) +
                  " opportunities · " +
                  formatMillions(ctx.dataset.amounts[ctx.dataIndex])
                );
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            title: { display: true, text: "Days since created" },
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: CHART_GRID_COLOR },
            title: { display: true, text: "Count" },
          },
        },
      },
    });
  }

  let winRateChart = null;

  function winRateLabelPlugin() {
    return {
      id: "winRateWonLabels",
      afterDatasetsDraw: function (chart) {
        const ctx = chart.ctx;
        const dataset = chart.data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        ctx.save();
        ctx.font = "11px Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
        ctx.fillStyle = CHART_LABEL_COLOR;
        ctx.textBaseline = "middle";
        meta.data.forEach(function (bar, i) {
          ctx.fillText(formatMillions(dataset.wonAmounts[i]) + " won", bar.x + 8, bar.y);
        });
        ctx.restore();
      },
    };
  }

  function renderWinRate(winRates) {
    const body = sectionBody("win-rate-chart");
    if (!body) return;

    const rows = (winRates || [])
      .slice()
      .sort(function (a, b) {
        const ar = a.win_rate;
        const br = b.win_rate;
        const aMissing = ar == null || !Number.isFinite(Number(ar));
        const bMissing = br == null || !Number.isFinite(Number(br));
        if (aMissing && bMissing) {
          return (Number(b.won_amount) || 0) - (Number(a.won_amount) || 0);
        }
        if (aMissing) return 1;
        if (bMissing) return -1;
        return Number(br) - Number(ar);
      });

    const labels = rows.map(function (row) {
      return row.partner || "(blank)";
    });
    const rates = rows.map(function (row) {
      return row.win_rate == null ? 0 : Number(row.win_rate) * 100;
    });
    const wonAmounts = rows.map(function (row) {
      return Number(row.won_amount) || 0;
    });

    body.innerHTML =
      '<div class="chart-wrap winrate-wrap">' +
      '<canvas id="win-rate-canvas" role="img" aria-label="' +
      escapeHtml(
        "Win rate percent by All Pipeline, sorted descending. Data labels show underlying Won dollars. " +
          rows
            .map(function (row) {
              const rate =
                row.win_rate == null ? "n/a" : formatPercent(row.win_rate);
              return (
                (row.partner || "") +
                " " +
                rate +
                ", " +
                formatMillions(row.won_amount) +
                " won"
              );
            })
            .join("; ")
      ) +
      '"></canvas>' +
      "</div>";

    if (typeof Chart === "undefined") {
      setPlaceholder("win-rate-chart", "Chart.js failed to load, so win rate cannot be shown.");
      return;
    }

    const canvas = document.getElementById("win-rate-canvas");
    if (winRateChart) {
      winRateChart.destroy();
      winRateChart = null;
    }

    winRateChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            data: rates,
            wonAmounts: wonAmounts,
            backgroundColor: PARTNER_BAR_COLOR,
            borderSkipped: false,
            borderRadius: 4,
            barThickness: 16,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const row = rows[ctx.dataIndex];
                const rate =
                  row.win_rate == null ? "n/a" : formatPercent(row.win_rate);
                return (
                  rate +
                  " win rate · " +
                  formatMillions(row.won_amount) +
                  " won · " +
                  formatMillions(row.close_amount) +
                  " closed lost"
                );
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            grid: { color: CHART_GRID_COLOR },
            ticks: {
              callback: function (value) {
                return value + "%";
              },
            },
            title: { display: true, text: "Win rate (Won $ / (Won $ + Close $))" },
          },
          y: {
            grid: { display: false },
            ticks: { autoSkip: false, font: { size: 11 } },
          },
        },
        layout: { padding: { right: 72 } },
      },
      plugins: [winRateLabelPlugin()],
    });
  }

  function renderDashboard(data) {
    if (!data || typeof data !== "object") {
      showError("pipeline.json did not contain a valid data object.");
      return;
    }

    hideLoading();
    dataAsOf.textContent = formatDataAsOf(data.generated_at);
    dataAsOf.hidden = false;
    errorBanner.hidden = true;
    dashboard.hidden = false;

    const sections = [
      ["fy-note", renderFyNote, data.fy_label],
      ["kpi-cards", renderKpiCards, { kpis: data.kpis, yoy_growth: data.yoy_growth }],
      ["stage-funnel", renderStageFunnel, data.stage_totals],
      ["large-opps", renderOppsBySize, {
        all_open_opportunities: data.all_open_opportunities,
        max_open_opportunity_amount: data.max_open_opportunity_amount,
      }],
      ["partner-ranking-chart", renderPartnerRanking, data.partner_totals],
      ["partner-code-chart", renderPartnerCodeRanking, data.partner_code_totals],
      ["product-ranking", renderProductTab, data.product_breakdown],
      ["industry-mix-chart", renderIndustryMix, data.industry_totals],
      ["top-accounts-chart", renderTopAccounts, data.top_accounts],
      ["trend-chart", renderTrend, data.trend],
      ["aging-histogram", renderAging, data.aging],
      ["win-rate-chart", renderWinRate, data.win_rate_by_partner],
      ["reconciliation", renderReconciliation, data.reconciliation],
    ];

    sections.forEach(function (entry) {
      const sectionId = entry[0];
      try {
        entry[1](entry[2]);
      } catch (err) {
        setPlaceholder(sectionId, "This section failed to render: " + err.message);
      }
    });

    setupViewTabs();
  }

  // Charts built inside a hidden panel measure 0px, so re-measure on reveal.
  function resizeChartsIn(panel) {
    if (!panel || typeof Chart === "undefined" || typeof Chart.getChart !== "function") {
      return;
    }
    panel.querySelectorAll("canvas").forEach(function (canvas) {
      const chart = Chart.getChart(canvas);
      if (chart) chart.resize();
    });
  }

  function setupViewTabs() {
    const tablist = document.getElementById("view-tabs");
    if (!tablist || tablist.dataset.wired === "true") return;
    tablist.dataset.wired = "true";

    const tabs = Array.prototype.slice.call(tablist.querySelectorAll("[data-tab-target]"));
    if (!tabs.length) return;

    function activate(targetId, focusTab) {
      tabs.forEach(function (tab) {
        const isActive = tab.getAttribute("data-tab-target") === targetId;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", isActive ? "true" : "false");
        tab.tabIndex = isActive ? 0 : -1;
        if (isActive && focusTab) tab.focus();

        const panel = document.getElementById(tab.getAttribute("data-tab-target"));
        if (panel) panel.hidden = !isActive;
        if (isActive) resizeChartsIn(panel);
      });
    }

    tablist.addEventListener("click", function (event) {
      const button = event.target.closest("[data-tab-target]");
      if (!button) return;
      activate(button.getAttribute("data-tab-target"), false);
    });

    tablist.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const current = tabs.findIndex(function (tab) {
        return tab.classList.contains("is-active");
      });
      if (current === -1) return;
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(current + step + tabs.length) % tabs.length];
      event.preventDefault();
      activate(next.getAttribute("data-tab-target"), true);
    });

    const initial = tabs.find(function (tab) {
      return tab.getAttribute("aria-selected") === "true";
    });
    activate((initial || tabs[0]).getAttribute("data-tab-target"), false);
  }

  async function loadDashboard() {
    let response;
    try {
      response = await fetch(DATA_URL, { cache: "no-store" });
    } catch (err) {
      showError(
        "Could not fetch data/pipeline.json.",
        "Serve the folder over HTTP (opening the HTML file directly is often blocked)."
      );
      return;
    }

    if (!response.ok) {
      showError(
        "Could not fetch data/pipeline.json (HTTP " + response.status + ")."
      );
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      showError("data/pipeline.json is not valid JSON.");
      return;
    }

    renderDashboard(data);
  }

  loadDashboard();
})();
