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

  function kpiCard(label, value) {
    return (
      '<article class="kpi-card">' +
      '<p class="kpi-value">' +
      escapeHtml(value) +
      "</p>" +
      '<p class="kpi-label">' +
      escapeHtml(label) +
      "</p>" +
      "</article>"
    );
  }

  function renderKpiCards(kpis) {
    const body = sectionBody("kpi-cards");
    if (!body) return;
    const data = kpis || {};
    body.innerHTML =
      '<div class="kpi-grid">' +
      kpiCard("Total open pipeline", formatMillions(data.total_open_pipeline)) +
      kpiCard("Open opportunities", formatCount(data.open_opportunity_count)) +
      kpiCard("Total won", formatMillions(data.total_won)) +
      kpiCard("Average deal size", formatMillions(data.average_deal_size)) +
      "</div>";
  }

  const FUNNEL_STAGES = ["Target", "Interact", "Propose", "Close", "Won"];
  const PARTNER_BAR_COLOR = "#1d4e89";
  const DCM_BAR_COLOR = "#7b8ea3";
  let stageFunnelChart = null;

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
        ctx.fillStyle = "#5c6b7a";
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
        label: "DCM",
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
        label: "Partner",
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
        label: "DCM",
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
        label: "Partner",
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
      "Partner pipeline by stage: " + funnelSummary(partnerRows);
    if (view === "dcm") {
      ariaLabel = "DCM pipeline by stage: " + funnelSummary(dcmRows);
    } else if (view === "compare") {
      ariaLabel =
        "Side-by-side comparison of partner and DCM pipeline by stage. Partner: " +
        funnelSummary(partnerRows) +
        ". DCM: " +
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
            grid: { color: "#eef1f4" },
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
      '<button type="button" class="toggle-btn is-active" data-funnel-view="partner" aria-pressed="true">Partner</button>' +
      '<button type="button" class="toggle-btn" data-funnel-view="dcm" aria-pressed="false">DCM</button>' +
      '<button type="button" class="toggle-btn" data-funnel-view="compare" aria-pressed="false">Compare</button>' +
      "</div>" +
      '<div class="chart-wrap">' +
      '<canvas id="stage-funnel-chart" role="img" aria-label="Partner pipeline stage funnel"></canvas>' +
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

  function wireOppsThresholdToggle() {
    var section = document.getElementById("large-opps");
    if (!section) return;
    var heading = document.getElementById("large-opps-title");
    var table10 = document.getElementById("opps-10m-table");
    var table20 = document.getElementById("opps-20m-table");
    var toolbar = section.querySelector("[aria-label='Opportunity amount threshold']");
    if (!toolbar) return;
    var btn10 = toolbar.querySelector('[data-opps-view="10m"]');
    var btn20 = toolbar.querySelector('[data-opps-view="20m"]');
    var n10 = document.querySelectorAll("#opps-10m-table tbody tr").length;
    var n20 = document.querySelectorAll("#opps-20m-table tbody tr").length;
    var empty10 = document.querySelector("#opps-10m-table .empty-row");
    var empty20 = document.querySelector("#opps-20m-table .empty-row");
    if (btn10) btn10.textContent = "≥ $10M (" + (empty10 ? 0 : n10) + ")";
    if (btn20) btn20.textContent = "≥ $20M (" + (empty20 ? 0 : n20) + ")";

    toolbar.addEventListener("click", function (event) {
      var button = event.target.closest("[data-opps-view]");
      if (!button) return;
      var view = button.getAttribute("data-opps-view");
      toolbar.querySelectorAll(".toggle-btn").forEach(function (btn) {
        var active = btn === button;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      var is20 = view === "20m";
      if (table10) table10.hidden = is20;
      if (table20) table20.hidden = !is20;
      if (heading) {
        heading.textContent = is20 ? "Opportunities ≥ $20M" : "Opportunities ≥ $10M";
      }
    });
  }

  function renderOpps10mTable(opps) {
    renderOppsTable("opps-10m-table", opps, "Opportunities ≥ $10M");
  }

  function renderOpps20mTable(opps) {
    renderOppsTable("opps-20m-table", opps, "Opportunities ≥ $20M");
    wireOppsThresholdToggle();
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
        ctx.fillStyle = "#5c6b7a";
        ctx.textBaseline = "middle";
        meta.data.forEach(function (bar, i) {
          const text = formatMillions(dataset.data[i]);
          ctx.fillText(text, bar.x + 8, bar.y);
        });
        ctx.restore();
      },
    };
  }

  function drawRankingChart(canvasId, rows, color) {
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
            backgroundColor: color,
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
            grid: { color: "#eef1f4" },
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
      "<h3>By partner name</h3>" +
      '<div class="chart-wrap ranking-wrap">' +
      '<canvas id="partner-ranking-canvas" role="img" aria-label="' +
      escapeHtml(rankingAria("Pipeline amount by partner name", rows)) +
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
      "<h3>By partner/product code</h3>" +
      '<div class="chart-wrap ranking-wrap">' +
      '<canvas id="partner-code-canvas" role="img" aria-label="' +
      escapeHtml(rankingAria("Pipeline amount by partner product code", rows)) +
      '"></canvas>' +
      "</div>";
    if (!drawRankingChart("partner-code-canvas", rows, DCM_BAR_COLOR)) {
      setPlaceholder(
        "partner-code-chart",
        "Chart.js failed to load, so product-code ranking cannot be shown."
      );
    }
  }

  const FOCUS_PRODUCT_CODES = ["USH16", "USH17", "USG18"];
  let productFocusData = {};
  let productFocusStageChart = null;
  let productFocusTrendChart = null;
  let productFocusWired = false;

  function destroyProductFocusCharts() {
    if (productFocusStageChart) {
      productFocusStageChart.destroy();
      productFocusStageChart = null;
    }
    if (productFocusTrendChart) {
      productFocusTrendChart.destroy();
      productFocusTrendChart = null;
    }
    if (rankingCharts["product-focus-partner-canvas"]) {
      rankingCharts["product-focus-partner-canvas"].destroy();
      rankingCharts["product-focus-partner-canvas"] = null;
    }
  }

  function defaultProductFocusCode(focus) {
    for (var i = 0; i < FOCUS_PRODUCT_CODES.length; i++) {
      var code = FOCUS_PRODUCT_CODES[i];
      var block = focus && focus[code];
      if (block && !block.no_data) return code;
    }
    return FOCUS_PRODUCT_CODES[0];
  }

  function setProductFocusTabState(code) {
    var toolbar = document.querySelector("#product-code-focus .chart-toolbar");
    if (!toolbar) return;
    toolbar.querySelectorAll("[data-focus-code]").forEach(function (btn) {
      var active = btn.getAttribute("data-focus-code") === code;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function focusStageRows(breakdown) {
    var byStage = {};
    (breakdown || []).forEach(function (row) {
      var name = row && row.stage != null ? String(row.stage) : "";
      byStage[name] = {
        stage: name,
        count: Number(row.count) || 0,
        amount: Number(row.amount) || 0,
      };
    });
    var rows = FUNNEL_STAGES.map(function (stage) {
      return byStage[stage] || { stage: stage, count: 0, amount: 0 };
    });
    Object.keys(byStage).forEach(function (name) {
      if (name && FUNNEL_STAGES.indexOf(name) === -1) {
        rows.push(byStage[name]);
      }
    });
    return rows;
  }

  function topPartnerFromBreakdown(rows) {
    var sorted = (rows || []).slice().sort(function (a, b) {
      return (Number(b.amount) || 0) - (Number(a.amount) || 0);
    });
    if (!sorted.length) return { partner: "—", amount: 0 };
    return {
      partner: sorted[0].partner || "(blank)",
      amount: Number(sorted[0].amount) || 0,
    };
  }

  function drawProductFocusStageChart(canvas, rows, code) {
    if (typeof Chart === "undefined") return false;
    if (productFocusStageChart) {
      productFocusStageChart.destroy();
      productFocusStageChart = null;
    }
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "Stage breakdown for " + code + ": " + funnelSummary(rows)
    );
    productFocusStageChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: rows.map(function (row) {
          return row.stage;
        }),
        datasets: [
          {
            data: rows.map(function (row) {
              return row.amount;
            }),
            counts: rows.map(function (row) {
              return row.count;
            }),
            backgroundColor: PARTNER_BAR_COLOR,
            borderSkipped: false,
            borderRadius: 4,
            barThickness: 22,
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
            grid: { color: "#eef1f4" },
            ticks: {
              callback: function (value) {
                return formatMillions(value);
              },
            },
          },
          y: { grid: { display: false }, ticks: { autoSkip: false } },
        },
        layout: { padding: { right: 72 } },
      },
      plugins: [stageBarLabelPlugin()],
    });
    return true;
  }

  function drawProductFocusTrendChart(canvas, trendRows, code) {
    if (typeof Chart === "undefined") return false;
    if (productFocusTrendChart) {
      productFocusTrendChart.destroy();
      productFocusTrendChart = null;
    }
    var rows = (trendRows || []).slice().sort(function (a, b) {
      return String(a.month || "").localeCompare(String(b.month || ""));
    });
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "Fiscal-year close-date trend for product code " + code
    );
    productFocusTrendChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: rows.map(function (row) {
          return formatFyMonthLabel(row.month);
        }),
        datasets: [
          {
            label: "Amount by close month",
            data: rows.map(function (row) {
              return Number(row.amount) || 0;
            }),
            borderColor: PARTNER_BAR_COLOR,
            backgroundColor: "rgba(29, 78, 137, 0.12)",
            tension: 0.2,
            fill: true,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return formatMillions(ctx.parsed.y);
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            grid: { color: "#eef1f4" },
            ticks: {
              callback: function (value) {
                return formatMillions(value);
              },
            },
          },
        },
      },
    });
    return true;
  }

  function renderProductFocusOppsTable(container, opps) {
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
          '<tr><td class="empty-row" colspan="6">No opportunities in this list.</td></tr>';
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
        "<caption>Top opportunities (" +
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

  function renderProductCodeFocus(code) {
    var panel = document.getElementById("product-code-focus-panel");
    if (!panel) return;
    destroyProductFocusCharts();

    var selected = code;
    if (FOCUS_PRODUCT_CODES.indexOf(selected) === -1) {
      selected = defaultProductFocusCode(productFocusData);
    }
    setProductFocusTabState(selected);
    panel.setAttribute("aria-label", "Detail for product code " + selected);

    var block = (productFocusData && productFocusData[selected]) || { no_data: true };
    if (block.no_data) {
      panel.innerHTML =
        '<p class="placeholder">No open opportunities currently tagged with this product code</p>';
      return;
    }

    var topPartner = topPartnerFromBreakdown(block.partner_breakdown);
    var stageRows = focusStageRows(block.stage_breakdown);
    var partnerRows = sortedRankingRows(block.partner_breakdown, "partner");

    panel.innerHTML =
      '<div class="kpi-grid kpi-grid-3">' +
      kpiCard("Total pipeline $", formatMillions(block.total)) +
      kpiCard("Opportunity count", formatCount(block.count)) +
      kpiCard(
        "Top partner by $ (" + formatMillions(topPartner.amount) + ")",
        topPartner.partner
      ) +
      "</div>" +
      '<h3 class="subsection-title">Stage breakdown</h3>' +
      '<div class="chart-wrap focus-chart-wrap">' +
      '<canvas id="product-focus-stage-canvas"></canvas>' +
      "</div>" +
      '<h3 class="subsection-title">Top opportunities</h3>' +
      '<div id="product-focus-opps-table"></div>' +
      '<h3 class="subsection-title">Partner breakdown</h3>' +
      '<div class="chart-wrap focus-chart-wrap">' +
      '<canvas id="product-focus-partner-canvas" role="img" aria-label="' +
      escapeHtml(rankingAria("Pipeline amount by partner for " + selected, partnerRows)) +
      '"></canvas>' +
      "</div>" +
      '<h3 class="subsection-title">Close-date trend</h3>' +
      '<div class="chart-wrap focus-trend-wrap">' +
      '<canvas id="product-focus-trend-canvas"></canvas>' +
      "</div>";

    var tableHost = document.getElementById("product-focus-opps-table");
    if (tableHost) renderProductFocusOppsTable(tableHost, block.top_opportunities);

    var stageCanvas = document.getElementById("product-focus-stage-canvas");
    var trendCanvas = document.getElementById("product-focus-trend-canvas");
    var stageOk = stageCanvas && drawProductFocusStageChart(stageCanvas, stageRows, selected);
    var partnerOk = drawRankingChart(
      "product-focus-partner-canvas",
      partnerRows,
      PARTNER_BAR_COLOR
    );
    var trendOk = trendCanvas && drawProductFocusTrendChart(trendCanvas, block.trend, selected);
    if (!stageOk && !partnerOk && !trendOk) {
      panel.innerHTML =
        '<p class="placeholder">Chart.js failed to load, so product-code charts cannot be shown.</p>';
    }
  }

  function renderProductCodeFocusSection(focus) {
    productFocusData = focus || {};
    var toolbar = document.querySelector("#product-code-focus .chart-toolbar");
    if (toolbar) {
      toolbar.querySelectorAll("[data-focus-code]").forEach(function (btn) {
        var code = btn.getAttribute("data-focus-code");
        var block = productFocusData[code];
        var count = block && !block.no_data ? formatCount(block.count) : "0";
        btn.textContent = code + " (" + count + ")";
      });
    }
    if (!productFocusWired && toolbar) {
      productFocusWired = true;
      toolbar.addEventListener("click", function (event) {
        var button = event.target.closest("[data-focus-code]");
        if (!button) return;
        renderProductCodeFocus(button.getAttribute("data-focus-code"));
      });
    }
    renderProductCodeFocus(defaultProductFocusCode(productFocusData));
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
      "<h3>DCM</h3>" +
      '<div class="chart-wrap industry-wrap">' +
      '<canvas id="industry-dcm-canvas" role="img" aria-label="' +
      escapeHtml(rankingAria("DCM pipeline by industry", dcmRows)) +
      '"></canvas>' +
      "</div>" +
      "</div>" +
      '<div class="ranking-panel">' +
      "<h3>Partner</h3>" +
      '<div class="chart-wrap industry-wrap">' +
      '<canvas id="industry-partner-canvas" role="img" aria-label="' +
      escapeHtml(rankingAria("Partner pipeline by industry", partnerRows)) +
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

  const INDUSTRY_PALETTE = [
    "#1d4e89",
    "#c45c26",
    "#2a9d8f",
    "#7b2d8e",
    "#c9a227",
    "#264653",
    "#e76f51",
    "#457b9d",
    "#6a994e",
    "#bc4749",
    "#8d99ae",
    "#2b6cb0",
    "#9c6644",
    "#52796f",
    "#b56576",
    "#3d5a80",
    "#ee9b00",
    "#606c38",
  ];

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

  function renderDeltaSummary(delta) {
    const body = sectionBody("delta-summary");
    if (!body) return;
    const data = delta || {};
    const dupes = data.duplicate_partner_opps || [];
    const amountMismatches = data.amount_mismatches || [];
    const stageMismatches = data.stage_mismatches || [];

    const dupeRows = dupes
      .map(function (row) {
        const partners = Array.isArray(row.partners) ? row.partners.join(", ") : "";
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(row.name || "") +
          "</td>" +
          "<td>" +
          escapeHtml(partners) +
          "</td>" +
          '<td class="num">' +
          escapeHtml(formatMillions(row.amount)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    const amountRows = amountMismatches
      .map(function (row) {
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(row.name || "") +
          "</td>" +
          '<td class="num">' +
          escapeHtml(formatMillions(row.dcm_amount)) +
          "</td>" +
          '<td class="num">' +
          escapeHtml(formatMillions(row.partner_amount)) +
          "</td>" +
          '<td class="num">' +
          escapeHtml(formatMillions(row.difference)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    const stageRows = stageMismatches
      .map(function (row) {
        const dcm = Array.isArray(row.dcm_stages) ? row.dcm_stages.join(", ") : "";
        const partner = Array.isArray(row.partner_stages)
          ? row.partner_stages.join(", ")
          : "";
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(row.name || "") +
          "</td>" +
          "<td>" +
          escapeHtml(dcm) +
          "</td>" +
          "<td>" +
          escapeHtml(partner) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    body.innerHTML =
      '<div class="kpi-grid delta-kpis">' +
      kpiCard("Matched opportunities", formatCount(data.matched_count)) +
      kpiCard("Only in DCM", formatCount(data.only_in_dcm_count)) +
      kpiCard("Only in partner", formatCount(data.only_in_partner_count)) +
      "</div>" +
      '<h3 class="subsection-title">Duplicate partner opportunities</h3>' +
      '<p class="warning-note">These opportunities appear under two or more partners. They are double-counted if partner totals are summed naively.</p>' +
      '<div class="table-wrap">' +
      '<table class="data-table">' +
      "<thead><tr><th>Opportunity Name</th><th>Partners</th><th class=\"num\">Amount</th></tr></thead>" +
      "<tbody>" +
      tableRowsOrEmpty(dupeRows, 3) +
      "</tbody></table></div>" +
      '<details class="mismatch-details">' +
      "<summary>Amount and stage mismatches (" +
      formatCount(amountMismatches.length + stageMismatches.length) +
      ")</summary>" +
      '<h3>Amount mismatches</h3>' +
      '<div class="table-wrap"><table class="data-table">' +
      "<thead><tr><th>Opportunity Name</th><th class=\"num\">DCM</th><th class=\"num\">Partner</th><th class=\"num\">Difference</th></tr></thead>" +
      "<tbody>" +
      tableRowsOrEmpty(amountRows, 4) +
      "</tbody></table></div>" +
      "<h3>Stage mismatches</h3>" +
      '<div class="table-wrap"><table class="data-table">' +
      "<thead><tr><th>Opportunity Name</th><th>DCM stages</th><th>Partner stages</th></tr></thead>" +
      "<tbody>" +
      tableRowsOrEmpty(stageRows, 3) +
      "</tbody></table></div>" +
      "</details>";
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
            backgroundColor: "rgba(29, 78, 137, 0.12)",
            tension: 0.2,
            fill: false,
            pointRadius: 3,
          },
          {
            label: "Cumulative Won $",
            data: cumulativeWon,
            borderColor: "#c45c26",
            backgroundColor: "rgba(196, 92, 38, 0.12)",
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
            grid: { color: "#eef1f4" },
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
            grid: { color: "#eef1f4" },
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
        ctx.fillStyle = "#5c6b7a";
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
        "Win rate percent by partner, sorted descending. Data labels show underlying Won dollars. " +
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
            grid: { color: "#eef1f4" },
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

  function renderDataQualityFlags(flags) {
    const body = sectionBody("data-quality-flags");
    if (!body) return;
    const source = flags || {};
    const nearZero = source.amount_le_1 || [];
    const stale = source.target_interact_close_over_365d || [];

    function flagRow(row, flagLabel) {
      return (
        "<tr>" +
        "<td><span class=\"flag-chip\">" +
        escapeHtml(flagLabel) +
        "</span></td>" +
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
    }

    const rowsHtml =
      nearZero.map(function (row) {
        return flagRow(row, "Near-zero amount");
      }).join("") +
      stale.map(function (row) {
        return flagRow(row, "Stale Target/Interact");
      }).join("");

    body.innerHTML =
      '<p class="warning-note">These rows may distort KPIs, rankings, and win rates. Near-zero amounts are $1 or less. Stale Target/Interact opportunities have a close date more than 365 days out.</p>' +
      '<div class="table-wrap"><table class="data-table">' +
      "<thead><tr>" +
      "<th>Flag</th><th>Opportunity Name</th><th>Partner</th><th>Stage</th>" +
      '<th class="num">Amount</th><th>Close Date</th>' +
      "</tr></thead><tbody>" +
      tableRowsOrEmpty(rowsHtml, 6) +
      "</tbody></table></div>";
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
      ["kpi-cards", renderKpiCards, data.kpis],
      ["stage-funnel", renderStageFunnel, data.stage_totals],
      ["opps-10m-table", renderOpps10mTable, data.opps_over_10m],
      ["opps-20m-table", renderOpps20mTable, data.opps_over_20m],
      ["partner-ranking-chart", renderPartnerRanking, data.partner_totals],
      ["partner-code-chart", renderPartnerCodeRanking, data.partner_code_totals],
      ["product-code-focus", renderProductCodeFocusSection, data.product_code_focus],
      ["industry-mix-chart", renderIndustryMix, data.industry_totals],
      ["top-accounts-chart", renderTopAccounts, data.top_accounts],
      ["delta-summary", renderDeltaSummary, data.delta],
      ["trend-chart", renderTrend, data.trend],
      ["aging-histogram", renderAging, data.aging],
      ["win-rate-chart", renderWinRate, data.win_rate_by_partner],
      ["data-quality-flags", renderDataQualityFlags, data.data_quality_flags],
    ];

    sections.forEach(function (entry) {
      const sectionId = entry[0];
      try {
        entry[1](entry[2]);
      } catch (err) {
        setPlaceholder(sectionId, "This section failed to render: " + err.message);
      }
    });
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
