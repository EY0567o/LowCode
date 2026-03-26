const defaultViewId = "kunde";
const integrationTabs = {
  website: {
    title: "Website JSON",
    getContent: (record) =>
      record ? JSON.stringify(record.integration.websiteJson || {}, null, 2) : "{}"
  },
  scoringRequest: {
    title: "Scoring Request XML",
    getContent: (record) =>
      record ? record.integration.scoringRequestXml || "Noch kein Scoring-Request vorhanden." : ""
  },
  scoringResponse: {
    title: "Scoring Response XML",
    getContent: (record) =>
      record ? record.integration.scoringResponseXml || "Noch keine Scoring-Response vorhanden." : ""
  },
  rateRequest: {
    title: "Rate Request JSON",
    getContent: (record) =>
      record && record.integration.rateRequestJson
        ? JSON.stringify(record.integration.rateRequestJson, null, 2)
        : "Noch kein Rate-Request vorhanden."
  },
  rateResponse: {
    title: "Rate Response JSON",
    getContent: (record) =>
      record && record.integration.rateResponseJson
        ? JSON.stringify(record.integration.rateResponseJson, null, 2)
        : "Noch keine Rate-Response vorhanden."
  }
};

const refs = {
  appShell: document.querySelector("[data-app-shell]"),
  sidebarToggle: document.querySelector("[data-sidebar-toggle]"),
  views: Array.from(document.querySelectorAll(".view")),
  navItems: Array.from(document.querySelectorAll("[data-view-target]")),
  banner: document.querySelector("[data-connection-banner]"),
  backendPill: document.querySelector("[data-backend-pill]"),
  customer: {
    form: document.querySelector("[data-customer-form]"),
    submit: document.querySelector("[data-submit-application]"),
    activeInquiry: document.querySelector("[data-customer-active-inquiry]"),
    activeStatus: document.querySelector("[data-customer-active-status]"),
    validation: document.querySelector("[data-customer-validation-note]"),
    collateral: document.querySelector("[data-customer-collateral-note]"),
    feedback: document.querySelector("[data-customer-form-feedback]"),
    reset: document.querySelector("[data-reset-form]"),
    json: document.querySelector("[data-customer-json]"),
    summary: document.querySelector("[data-customer-summary]"),
    actions: document.querySelector("[data-customer-actions]"),
    timeline: document.querySelector("[data-customer-timeline]")
  },
  sach: {
    activeInquiry: document.querySelector("[data-sach-active-inquiry]"),
    count: document.querySelector("[data-worklist-count]"),
    overallStatus: document.querySelector("[data-sach-overall-status]"),
    table: document.querySelector("[data-worklist-table]"),
    detailGrid: document.querySelector("[data-sach-detail-grid]"),
    routing: document.querySelector("[data-sach-routing-panel]"),
    processing: document.querySelector("[data-sach-processing-panel]"),
    actions: document.querySelector("[data-sach-actions]")
  },
  team: {
    activeInquiry: document.querySelector("[data-team-active-inquiry]"),
    count: document.querySelector("[data-team-queue-count]"),
    decisionStatus: document.querySelector("[data-team-decision-status]"),
    queue: document.querySelector("[data-team-queue]"),
    detailGrid: document.querySelector("[data-team-detail-grid]"),
    guidance: document.querySelector("[data-team-guidance]"),
    actions: document.querySelector("[data-team-actions]")
  },
  integration: {
    inquiry: document.querySelector("[data-integration-inquiry]"),
    status: document.querySelector("[data-integration-technical-status]"),
    monitor: document.querySelector("[data-integration-monitor]"),
    log: document.querySelector("[data-system-log]"),
    note: document.querySelector("[data-integration-error-note]"),
    panelTitle: document.querySelector("[data-integration-panel-title]"),
    code: document.querySelector("[data-integration-code]"),
    tabs: Array.from(document.querySelectorAll("[data-integration-tab]"))
  },
  audit: {
    count: document.querySelector("[data-audit-count]"),
    nameFilter: document.querySelector('[data-audit-filter="name"]'),
    inquiryFilter: document.querySelector('[data-audit-filter="inquiryId"]'),
    statusFilter: document.querySelector('[data-audit-filter="status"]'),
    table: document.querySelector("[data-audit-table]"),
    detailGrid: document.querySelector("[data-audit-detail-grid]"),
    documents: document.querySelector("[data-audit-document-panel]")
  }
};

const formDefaults = {
  firstName: "Mia",
  lastName: "Hansen",
  email: "mia.hansen@email.de",
  address: "Beispielweg 12",
  postalCode: "80331",
  city: "München",
  employer: "Nordlicht Retail GmbH",
  employerVatId: "DE123456789",
  monthlyNetIncome: "3200",
  employedSince: "2020-05-01",
  iban: "DE02120300000000202051",
  loanType: "Konsumentenkredit",
  loanAmount: "12000",
  termMonths: "48",
  purpose: "Wohnungseinrichtung"
};

const apiBaseUrl = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const localStore = {
  sequence: 0,
  applications: [],
  logs: []
};

  const state = {
    activeView: defaultViewId,
    selectedId: null,
    customerRecordId: null,
    integrationTab: "website",
    customerDraft: { ...formDefaults },
  auditFilters: {
    name: "",
    inquiryId: "",
    status: "alle"
  },
  applications: [],
  logs: [],
  backendConnected: false,
  transportMode: "remote"
};

function createElement(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);

  if (options.className) {
    node.className = options.className;
  }

  if (options.text !== undefined) {
    node.textContent = options.text;
  }

  if (options.type) {
    node.type = options.type;
  }

  if (options.disabled) {
    node.disabled = true;
  }

  if (options.value !== undefined) {
    node.value = options.value;
  }

  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        node.setAttribute(key, String(value));
      }
    });
  }

  if (options.dataset) {
    Object.entries(options.dataset).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        node.dataset[key] = String(value);
      }
    });
  }

  const normalizedChildren = Array.isArray(children) ? children : [children];
  normalizedChildren.flat().filter(Boolean).forEach((child) => {
    if (typeof child === "string") {
      node.appendChild(document.createTextNode(child));
    } else {
      node.appendChild(child);
    }
  });

  return node;
}

function clearNode(node) {
  if (node) {
    node.replaceChildren();
  }
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(value, fractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "–";
  }

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(Number(value));
}

function formatDate(value) {
  if (!value) {
    return "–";
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) {
    return "–";
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getStatusTone(status) {
  const tones = {
    Eingang: "neutral",
    Routing: "info",
    "In Prüfung": "warning",
    Teamleitung: "warning",
    Angebot: "info",
    Signatur: "info",
    Abgeschlossen: "success",
    Rückfrage: "warning",
    Fehler: "danger",
    Abgelehnt: "danger",
    Bereit: "neutral",
    Aktiv: "success",
    Empfangen: "info",
    Vollständig: "success",
    "Nicht erforderlich": "neutral",
    "Nicht gestartet": "neutral",
    Ausstehend: "warning",
    Freigegeben: "success",
    "Angebot erstellt": "info",
    "Dokument erstellt": "success",
    "Zur Signatur gesendet": "info",
    Signiert: "success",
    Versendet: "success",
    Archiviert: "success",
    Warnung: "warning",
    Transformiert: "info",
    Vorhanden: "success",
    "Spätere Phase": "info",
    Offen: "warning"
  };

  return tones[status] || "neutral";
}

function createStatusChip(text) {
  return createElement("span", {
    className: `status-chip status-chip-${getStatusTone(text)}`,
    text
  });
}

function applyHeaderStatus(node, text) {
  if (!node) {
    return;
  }

  node.className = `page-header-status status-chip-${getStatusTone(text)}`;
  node.textContent = text;
}

function createDetailItem(label, value, subtext) {
  const item = createElement("div", { className: "detail-item" });
  item.appendChild(createElement("span", { className: "detail-item-label", text: label }));
  item.appendChild(createElement("strong", { className: "detail-item-value", text: value }));

  if (subtext) {
    item.appendChild(createElement("span", { className: "detail-item-sub", text: subtext }));
  }

  return item;
}

function createNotice(text, tone = "info") {
  return createElement("div", {
    className: `notice notice-${tone}`,
    text
  });
}

function createEmptyState(text) {
  return createElement("div", { className: "empty-state", text });
}

function createTableCell(main, subtext, extraNode) {
  const cell = createElement("div", { className: "table-cell" });
  if (main !== undefined && main !== null && String(main).trim() !== "") {
    cell.appendChild(createElement("span", { className: "table-cell-main", text: main }));
  }

  if (subtext) {
    cell.appendChild(createElement("span", { className: "table-cell-sub", text: subtext }));
  }

  if (extraNode) {
    cell.appendChild(extraNode);
  }

  return cell;
}

function createSelectableRow(record, className, columns, selected) {
  const row = createElement("button", {
    className: `table-row ${className}${selected ? " is-selected" : ""}`,
    type: "button",
    dataset: {
      selectRecord: record.id
    },
    attrs: {
      "aria-pressed": selected ? "true" : "false"
    }
  });

  columns.forEach((column) => {
    row.appendChild(createTableCell(column.main, column.subtext, column.extraNode));
  });

  return row;
}

function createLogItem(entry) {
  const row = createElement("div", { className: "log-item" });
  const top = createElement("div", { className: "log-top" });
  top.appendChild(
    createElement("strong", {
      text: `${formatDateTime(entry.timestamp)} · ${entry.interfaceName}`
    })
  );
  top.appendChild(createStatusChip(entry.status));
  row.appendChild(top);
  row.appendChild(
    createElement("p", {
      text: `${entry.inquiryId} · ${entry.message}`
    })
  );
  return row;
}

  function getSelectedRecord() {
    return state.applications.find((record) => record.id === state.selectedId) || state.applications[0] || null;
  }

  function getCustomerRecord() {
    return state.applications.find((record) => record.id === state.customerRecordId) || null;
  }

function getTeamQueue() {
  return state.applications.filter(
    (record) =>
      record.teamleadRequired &&
      record.teamleadDecision === "Ausstehend" &&
      record.supportedInPhaseOne &&
      !record.invalidProductRange
  );
}

function buildWebsitePreviewPayload(draft) {
  const [street, houseNumber] = splitAddress(draft.address);
  return {
    origin: "MFLB-Website LA",
    version: "1.2.0",
    loanapplication: {
      vorname: draft.firstName,
      nachname: draft.lastName,
      strasse: street,
      hausnummer: houseNumber,
      plz: draft.postalCode,
      ort: draft.city,
      arbeitgeber: draft.employer,
      arbeitgeberustid: draft.employerVatId,
      "beschaeftigt-seit": formatContractDate(draft.employedSince),
      ibanhausbank: formatContractIban(draft.iban),
      kredithoehe: toNumber(draft.loanAmount),
      laufzeitmonate: toNumber(draft.termMonths),
      kreditzweck: draft.purpose
    }
  };
}

function hasRequiredDraftFields(draft) {
  const fields = [
    "firstName",
    "lastName",
    "email",
    "address",
    "postalCode",
    "city",
    "employer",
    "monthlyNetIncome",
    "employedSince",
    "iban",
    "loanType",
    "loanAmount",
    "termMonths",
    "purpose"
  ];

  return !fields.some((field) => !String(draft[field] || "").trim());
}

function getDraftScopeMessage(draft) {
  const loanAmount = toNumber(draft.loanAmount);

  if (!loanAmount) {
    return null;
  }

  if (draft.loanType === "Konsumentenkredit" && loanAmount < 5000) {
    return "Der Antrag wird angenommen, liegt mit Konsumentenkredit unter 5.000 € aber außerhalb des aktuellen Produktkorridors.";
  }

  if (draft.loanType === "Konsumentenkredit" && loanAmount > 20000 && loanAmount < 100000) {
    return "Der Antrag wird angenommen, aber Konsumentenkredite über 20.000 € und unter 100.000 € gibt es fachlich nicht.";
  }

  if (draft.loanType === "Baufinanzierung" && loanAmount > 20000) {
    return "Baufinanzierungen werden angenommen, in eine Spezialabteilung geroutet und als spätere Projektphase markiert.";
  }

  if (draft.loanType === "Großkredit" || loanAmount >= 100000) {
    return "Großkredite werden angenommen, in eine Spezialabteilung geroutet und als spätere Projektphase markiert.";
  }

  if (draft.loanType === "Baufinanzierung") {
    return "Baufinanzierungen beginnen fachlich erst oberhalb von 20.000 € und werden entsprechend markiert.";
  }

  if (draft.loanType === "Konsumentenkredit" && loanAmount >= 10000) {
    return "Der Antrag kann verarbeitet werden. Ab 10.000 € ist zusätzlich eine Teamleiterfreigabe erforderlich.";
  }

  return null;
}

function validateDraft(draft) {
  if (!hasRequiredDraftFields(draft)) {
    return {
      valid: false,
      tone: "danger",
      hardBlock: true,
      message: "Für den JSON-Eingang müssen alle Pflichtfelder vollständig vorliegen."
    };
  }

  const scopeMessage = getDraftScopeMessage(draft);

  if (scopeMessage) {
    return {
      valid: true,
      tone: "warning",
      hardBlock: false,
      message: scopeMessage
    };
  }

  return {
    valid: true,
    tone: "info",
    hardBlock: false,
    message: "Pflichtfelder sind vollständig. Die Website könnte den Antrag direkt als JSON übergeben."
  };
}

function getCollateralNote(draft) {
  const loanAmount = toNumber(draft.loanAmount);

  if (draft.loanType === "Konsumentenkredit" && loanAmount <= 20000) {
    return "Keine Sicherheiten erforderlich.";
  }

  if (draft.loanType === "Baufinanzierung" || loanAmount >= 100000) {
    return "Sicherheiten-Workflow für spätere Projektphase vorgesehen.";
  }

  return "Sicherheiten und Sonderprüfungen werden abhängig vom Produktkorridor fachlich markiert.";
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildInquiryId(sequence, createdAt) {
  const date = new Date(createdAt);
  const suffix = String(sequence).padStart(4, "0");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}-${suffix}`;
}

function splitAddress(value) {
  const compact = String(value || "").trim().replace(/\s+/g, " ");
  if (!compact.includes(" ")) {
    return [compact, ""];
  }
  return compact.split(/ (?!.* )/);
}

function formatContractDate(value) {
  if (!value) {
    return "";
  }
  if (String(value).includes(".")) {
    return String(value);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}.${date.getFullYear()}`;
}

function parseContractDate(value) {
  if (!value) {
    return "";
  }
  if (String(value).includes(".")) {
    const [day, month, year] = String(value).split(".");
    return `${year}-${month}-${day}`;
  }
  return String(value);
}

function normalizeIban(value) {
  return String(value || "").replace(/\s+/g, "");
}

function formatContractIban(value) {
  const compact = normalizeIban(value);
  return compact.replace(/(.{4})/g, "$1 ").trim();
}

function monthsSince(dateString) {
  const start = new Date(dateString);
  const now = new Date("2026-03-25T12:00:00");
  let months = (now.getFullYear() - start.getFullYear()) * 12;
  months += now.getMonth() - start.getMonth();
  return Math.max(0, months);
}

function determineDepartment(record) {
  if (record.loanType === "Baufinanzierung" && record.loanAmount > 20000) {
    return {
      department: "Baufinanzierung",
      routeMessage:
        "Baufinanzierungen werden fachlich angenommen, in die Spezialabteilung Baufinanzierung geroutet und als spätere Projektphase markiert.",
      supportedInPhaseOne: false,
      futurePhase: true,
      invalidProductRange: false
    };
  }

  if (record.loanType === "Großkredit" || record.loanAmount >= 100000) {
    return {
      department: "Großkredite",
      routeMessage:
        "Großkredite ab 100.000 € werden fachlich angenommen, in eine Spezialabteilung geroutet und als spätere Projektphase markiert.",
      supportedInPhaseOne: false,
      futurePhase: true,
      invalidProductRange: false
    };
  }

  if (
    record.loanType === "Konsumentenkredit" &&
    record.loanAmount >= 5000 &&
    record.loanAmount <= 20000
  ) {
    return {
      department: "Konsumentenkredite",
      routeMessage:
        "Der Antrag liegt im Zielkorridor der ersten Projektphase und wird an die Abteilung Konsumentenkredite geroutet.",
      supportedInPhaseOne: true,
      futurePhase: false,
      invalidProductRange: false
    };
  }

  if (
    record.loanType === "Konsumentenkredit" &&
    record.loanAmount > 20000 &&
    record.loanAmount < 100000
  ) {
    return {
      department: "Produktgrenze / Rückfrage",
      routeMessage:
        "Konsumentenkredite über 20.000 € und unter 100.000 € gibt es fachlich nicht. Der Antrag wird angenommen, aber als Produktgrenze markiert.",
      supportedInPhaseOne: false,
      futurePhase: false,
      invalidProductRange: true
    };
  }

  if (record.loanType === "Konsumentenkredit" && record.loanAmount < 5000) {
    return {
      department: "Produktgrenze / Rückfrage",
      routeMessage:
        "Konsumentenkredite unter 5.000 € liegen außerhalb des definierten Produktkorridors. Der Antrag wird angenommen, aber fachlich markiert.",
      supportedInPhaseOne: false,
      futurePhase: false,
      invalidProductRange: true
    };
  }

  if (record.loanType === "Baufinanzierung") {
    return {
      department: "Baufinanzierung / Rückfrage",
      routeMessage:
        "Baufinanzierungen beginnen fachlich erst oberhalb von 20.000 €. Der Antrag wird angenommen, aber als Produktgrenze markiert.",
      supportedInPhaseOne: false,
      futurePhase: false,
      invalidProductRange: true
    };
  }

  if (record.loanType === "Großkredit") {
    return {
      department: "Großkredit / Rückfrage",
      routeMessage:
        "Großkredite beginnen fachlich erst ab 100.000 €. Der Antrag wird angenommen, aber als Produktgrenze markiert.",
      supportedInPhaseOne: false,
      futurePhase: false,
      invalidProductRange: true
    };
  }

  return {
    department: "Vorprüfung",
    routeMessage:
      "Der Antrag liegt außerhalb des aktuell definierten Zielkorridors und muss fachlich geklärt werden.",
    supportedInPhaseOne: false,
    futurePhase: false,
    invalidProductRange: true
  };
}

function requiresTeamlead(record) {
  return record.loanAmount >= 10000;
}

function getPhaseLabel(record) {
  if (record.supportedInPhaseOne) {
    return "Phase 1";
  }
  if (record.futurePhase) {
    return "Spätere Projektphase";
  }
  if (record.invalidProductRange) {
    return "Produktgrenze";
  }
  return "Fachliche Klärung";
}

function createDefaultDocuments(record) {
  const collateralStatus =
    record.loanType === "Konsumentenkredit" && record.loanAmount <= 20000
      ? "Nicht erforderlich"
      : record.loanType === "Baufinanzierung" || record.loanAmount >= 100000
        ? "Spätere Phase"
        : "Ausstehend";

  return [
    {
      name: "Online-Antrag",
      status: "Empfangen",
      detail: "Website liefert ein vollständiges JSON-Objekt."
    },
    {
      name: "Identitätsnachweis",
      status: "Vorhanden",
      detail: "Pflichtdokument für die Vorprüfung."
    },
    {
      name: "Einkommensnachweis",
      status: "Vorhanden",
      detail: "Pflichtdokument für die Bonitätsprüfung."
    },
    {
      name: "Sicherheiten",
      status: collateralStatus,
      detail: getCollateralNote(record)
    },
    {
      name: "Angebotsdokument",
      status: "Nicht gestartet",
      detail: "Wird nach erfolgreicher Konditionsberechnung erzeugt."
    },
    {
      name: "Signaturprotokoll",
      status: "Nicht gestartet",
      detail: "Wird nach der Signaturstrecke aktualisiert."
    }
  ];
}

function setDocumentStatus(record, name, status, detail) {
  const existing = record.documents.find((document) => document.name === name);
  if (existing) {
    existing.status = status;
    existing.detail = detail;
    return;
  }

  record.documents.push({ name, status, detail });
}

function computeOverallStatus(record) {
  if (record.teamleadDecision === "Abgelehnt") {
    return "Abgelehnt";
  }

  if (record.integration.errorMessage) {
    return "Fehler";
  }

  if (record.invalidProductRange || record.teamleadDecision === "Rückfrage") {
    return "Rückfrage";
  }

  if (record.archiveStatus === "Archiviert" || record.mailStatus === "Versendet") {
    return "Abgeschlossen";
  }

  if (["Zur Signatur gesendet", "Signiert"].includes(record.signatureStatus)) {
    return "Signatur";
  }

  if (
    record.offerStatus === "Angebot erstellt" ||
    record.documentStatus === "Dokument erstellt" ||
    record.rateCalculationStatus === "Abgeschlossen"
  ) {
    return "Angebot";
  }

  if (record.teamleadRequired && record.teamleadDecision === "Ausstehend") {
    return "Teamleitung";
  }

  if (["Abgeschlossen", "In Bearbeitung"].includes(record.scoringStatus)) {
    return "In Prüfung";
  }

  if (record.department !== "Vorprüfung") {
    return "Routing";
  }

  return "Eingang";
}

function normalizeRecord(record) {
  Object.assign(record, determineDepartment(record));
  record.teamleadRequired = requiresTeamlead(record);

  if (record.teamleadRequired) {
    if (record.teamleadDecision === "Nicht erforderlich") {
      record.teamleadDecision = "Nicht gestartet";
    }
  } else {
    record.teamleadDecision = "Nicht erforderlich";
  }

  if (!Array.isArray(record.documents) || record.documents.length === 0) {
    record.documents = createDefaultDocuments(record);
  }

  setDocumentStatus(
    record,
    "Sicherheiten",
    record.loanType === "Konsumentenkredit" && record.loanAmount <= 20000
      ? "Nicht erforderlich"
      : record.loanType === "Baufinanzierung" || record.loanAmount >= 100000
        ? "Spätere Phase"
        : "Ausstehend",
    getCollateralNote(record)
  );
  setDocumentStatus(
    record,
    "Angebotsdokument",
    record.documentStatus === "Dokument erstellt" ? "Dokument erstellt" : "Nicht gestartet",
    record.documentStatus === "Dokument erstellt"
      ? "Angebotsdokument wurde erzeugt."
      : "Wird nach erfolgreicher Konditionsberechnung erzeugt."
  );
  setDocumentStatus(
    record,
    "Signaturprotokoll",
    record.signatureStatus === "Signiert"
      ? "Signiert"
      : record.signatureStatus === "Zur Signatur gesendet"
        ? "Zur Signatur gesendet"
        : "Nicht gestartet",
    record.signatureStatus === "Signiert"
      ? "Digitale Signatur erfolgreich abgeschlossen."
      : record.signatureStatus === "Zur Signatur gesendet"
        ? "Vorgang liegt beim Signaturdienst."
        : "Wird nach der Signaturstrecke aktualisiert."
  );

  record.completenessStatus = "Vollständig";
  record.integration.technicalStatus = record.integration.errorMessage
    ? "Fehler"
    : record.integration.scoringResponseXml || record.integration.rateResponseJson
      ? "Aktiv"
      : "Bereit";
  record.overallStatus = computeOverallStatus(record);
  record.currentOwner =
    record.overallStatus === "Abgeschlossen"
      ? "Archiv"
      : record.overallStatus === "Teamleitung"
        ? "Teamleitung"
        : "Sachbearbeitung";

  return record;
}

function createRecordFromDraft(draft, { id, inquiryId, createdAt }) {
  const [street, houseNumber] = splitAddress(draft.address);
  const websiteJson = {
    origin: "MFLB-Website LA",
    version: "1.2.0",
    loanapplication: {
      vorname: draft.firstName,
      nachname: draft.lastName,
      strasse: street,
      hausnummer: houseNumber,
      plz: draft.postalCode,
      ort: draft.city,
      arbeitgeber: draft.employer,
      arbeitgeberustid: draft.employerVatId || "–",
      "beschaeftigt-seit": formatContractDate(draft.employedSince),
      ibanhausbank: formatContractIban(draft.iban),
      kredithoehe: toNumber(draft.loanAmount),
      laufzeitmonate: toNumber(draft.termMonths),
      kreditzweck: draft.purpose
    }
  };

  return normalizeRecord({
    id,
    inquiryId,
    createdAt,
    firstName: draft.firstName,
    lastName: draft.lastName,
    email: draft.email,
    street,
    houseNumber,
    address: draft.address,
    postalCode: draft.postalCode,
    city: draft.city,
    employer: draft.employer,
    employerVatId: draft.employerVatId || "–",
    employedSince: draft.employedSince,
    monthlyNetIncome: toNumber(draft.monthlyNetIncome),
    iban: normalizeIban(draft.iban),
    loanType: draft.loanType,
    loanAmount: toNumber(draft.loanAmount),
    termMonths: toNumber(draft.termMonths),
    purpose: draft.purpose,
    department: "Vorprüfung",
    routeMessage: "",
    supportedInPhaseOne: false,
    futurePhase: false,
    invalidProductRange: false,
    documents: [],
    completenessStatus: "Vollständig",
    scoringStatus: "Nicht gestartet",
    score: null,
    riskClass: "–",
    teamleadRequired: false,
    teamleadDecision: "Nicht erforderlich",
    rateCalculationStatus: "Nicht gestartet",
    interestRate: null,
    monthlyRate: null,
    offerStatus: "Nicht gestartet",
    documentStatus: "Nicht gestartet",
    signatureStatus: "Nicht gestartet",
    mailStatus: "Nicht gestartet",
    archiveStatus: "Nicht gestartet",
    overallStatus: "Eingang",
    currentOwner: "Website",
    logs: [],
    integration: {
      technicalStatus: "Bereit",
      errorMessage: "",
      websiteJson,
      scoringRequestXml: "",
      scoringResponseXml: "",
      rateRequestJson: null,
      rateResponseJson: null
    }
  });
}

function calculateMockScore(record) {
  const employmentFactor = Math.min(15, monthsSince(record.employedSince) / 24);
  const incomeFactor = Math.min(20, record.monthlyNetIncome / 250);
  const amountPenalty = Math.min(15, record.loanAmount / 3000);
  const termPenalty = Math.min(10, record.termMonths / 24);
  const vatBonus = record.employerVatId !== "–" ? 4 : 0;
  const ibanBonus = String(record.iban).startsWith("DE") ? 3 : 0;
  const rawScore =
    55 + employmentFactor + incomeFactor + vatBonus + ibanBonus - amountPenalty - termPenalty;
  return Math.max(1, Math.min(100, Math.round(rawScore)));
}

function getRiskClass(score) {
  if (score >= 85) {
    return "A";
  }
  if (score >= 70) {
    return "B";
  }
  if (score >= 55) {
    return "C";
  }
  return "D";
}

function mapToScoringXml(record) {
  return [
    "<ScoringRequest>",
    `  <AnfrageID>${record.inquiryId}</AnfrageID>`,
    `  <Vorname>${record.firstName}</Vorname>`,
    `  <Nachname>${record.lastName}</Nachname>`,
    `  <Strasse>${record.street || splitAddress(record.address)[0]}</Strasse>`,
    `  <Hausnummer>${record.houseNumber || splitAddress(record.address)[1]}</Hausnummer>`,
    `  <PLZ>${record.postalCode}</PLZ>`,
    `  <Ort>${record.city}</Ort>`,
    `  <Arbeitgeber>${record.employer}</Arbeitgeber>`,
    `  <ArbeitgeberUstID>${record.employerVatId}</ArbeitgeberUstID>`,
    `  <BeschaeftigtSeit>${formatContractDate(record.employedSince)}</BeschaeftigtSeit>`,
    `  <IBANHausbank>${formatContractIban(record.iban)}</IBANHausbank>`,
    "</ScoringRequest>"
  ].join("\n");
}

function mapToRatePayload(record) {
  return {
    target: "MFLB-RateCalculator",
    version: "2.5.0",
    loanapplication: {
      name: record.firstName,
      surname: record.lastName,
      street: record.street || splitAddress(record.address)[0],
      adress1: record.houseNumber || splitAddress(record.address)[1],
      postalcode: record.postalCode,
      adress2: record.city,
      loan_amount: record.loanAmount,
      term_in_months: record.termMonths,
      collaterals: !(record.loanType === "Konsumentenkredit" && record.loanAmount <= 20000),
      rate: 0
    }
  };
}

function calculateAnnuity(principal, annualRatePercent, months) {
  const monthlyRate = annualRatePercent / 100 / 12;
  if (!monthlyRate) {
    return principal / Math.max(1, months);
  }
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -Math.max(1, months)));
}

function appendLocalLog(record, interfaceName, message, status = "OK") {
  const entry = {
    id: `${record.id}-${interfaceName}-${record.logs.length + 1}`,
    recordId: record.id,
    inquiryId: record.inquiryId,
    interfaceName,
    message,
    status,
    timestamp: new Date().toISOString()
  };
  record.logs.unshift(entry);
  record.logs = record.logs.slice(0, 12);
}

function syncLocalLogs() {
  localStore.logs = localStore.applications
    .flatMap((record) => record.logs)
    .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
    .slice(0, 30);
}

function localRunScoring(record, forceError = false) {
  record.scoringStatus = "In Bearbeitung";
  record.integration.scoringRequestXml = mapToScoringXml(record);
  record.integration.errorMessage = "";

  if (forceError) {
    record.scoringStatus = "Fehler";
    record.integration.scoringResponseXml = [
      "<ScoringResponse>",
      `  <AnfrageID>${record.inquiryId}</AnfrageID>`,
      `  <Vorname>${record.firstName}</Vorname>`,
      `  <Nachname>${record.lastName}</Nachname>`,
      "  <Result>ERROR</Result>",
      "  <Message>Timeout in downstream scoring module</Message>",
      "</ScoringResponse>"
    ].join("\n");
    record.integration.errorMessage =
      "Scoring-REST-Schnittstelle meldet einen Fehler. XML-Response konnte nicht fachlich verarbeitet werden.";
    appendLocalLog(record, "Scoring REST", record.integration.errorMessage, "Fehler");
    normalizeRecord(record);
    return;
  }

  const score = calculateMockScore(record);
  const riskClass = getRiskClass(score);
  record.integration.scoringResponseXml = [
    "<ScoringResponse>",
    `  <AnfrageID>${record.inquiryId}</AnfrageID>`,
    `  <Vorname>${record.firstName}</Vorname>`,
    `  <Nachname>${record.lastName}</Nachname>`,
    `  <Score>${score}</Score>`,
    "</ScoringResponse>"
  ].join("\n");
  record.score = score;
  record.riskClass = riskClass;
  record.scoringStatus = "Abgeschlossen";
  appendLocalLog(record, "Scoring REST", "Scoring-XML wurde transformiert und zurückgeführt.");
  normalizeRecord(record);
}

function localRunRate(record) {
  const payload = mapToRatePayload(record);
  const riskMarkup = { A: 0.35, B: 0.65, C: 1.1, D: 1.65 };
  const annualInterestRate = Number(
    (
      4.05 +
      Math.min(0.7, record.loanAmount / 25000) +
      Math.min(0.5, record.termMonths / 120) +
      (riskMarkup[record.riskClass] || 1.25)
    ).toFixed(1)
  );
  const monthlyInstallment = Number(
    calculateAnnuity(record.loanAmount, annualInterestRate, record.termMonths).toFixed(2)
  );

  record.integration.rateRequestJson = payload;
  record.integration.rateResponseJson = {
    ...payload,
    loanapplication: {
      ...payload.loanapplication,
      rate: monthlyInstallment
    }
  };
  record.rateCalculationStatus = "Abgeschlossen";
  record.interestRate = annualInterestRate;
  record.monthlyRate = monthlyInstallment;
  appendLocalLog(record, "RateCalculator REST", "Zinsrechner wurde mit JSON-Payload aufgerufen.");
  normalizeRecord(record);
}

function localHandleAction(record, action) {
  switch (action) {
    case "run_scoring":
      localRunScoring(record);
      break;
    case "run_rate":
      localRunRate(record);
      break;
    case "send_teamlead":
      record.teamleadDecision = "Ausstehend";
      appendLocalLog(record, "Workflow", "Vorgang wurde an die Teamleitung übergeben.");
      normalizeRecord(record);
      break;
    case "team_approve":
      record.teamleadDecision = "Freigegeben";
      appendLocalLog(record, "Teamleitung", "Antrag wurde freigegeben.");
      normalizeRecord(record);
      break;
    case "team_reject":
      record.teamleadDecision = "Abgelehnt";
      appendLocalLog(record, "Teamleitung", "Antrag wurde abgelehnt.", "Fehler");
      normalizeRecord(record);
      break;
    case "generate_offer":
      if (record.rateCalculationStatus !== "Abgeschlossen") {
        localRunRate(record);
      }
      record.offerStatus = "Angebot erstellt";
      record.documentStatus = "Dokument erstellt";
      appendLocalLog(record, "Dokumentenservice", "Angebotsdokument wurde erzeugt.");
      normalizeRecord(record);
      break;
    case "send_signature":
      record.signatureStatus = "Zur Signatur gesendet";
      appendLocalLog(record, "Signaturdienst", "Dokument wurde an den Signaturdienst übergeben.");
      normalizeRecord(record);
      break;
    case "customer_sign":
      if (record.signatureStatus !== "Zur Signatur gesendet") {
        break;
      }
      record.signatureStatus = "Signiert";
      appendLocalLog(record, "Kundenportal", "Digitale Signatur wurde durch den Kunden abgeschlossen.");
      normalizeRecord(record);
      break;
    case "send_mail":
      if (record.signatureStatus !== "Signiert") {
        break;
      }
      record.mailStatus = "Versendet";
      record.archiveStatus = "Archiviert";
      appendLocalLog(record, "Mailservice", "Signiertes Dokument wurde versendet und archiviert.");
      normalizeRecord(record);
      break;
    default:
      break;
  }
}

function seedLocalStore() {
  if (localStore.applications.length > 0) {
    return;
  }

  const definitions = [
    {
      firstName: "Erika",
      lastName: "Sommer",
      email: "erika.sommer@mflb-demo.de",
      address: "Rosenweg 3",
      postalCode: "80331",
      city: "München",
      employer: "Lumen Handels GmbH",
      employerVatId: "DE214567890",
      monthlyNetIncome: "3400",
      employedSince: "2019-04-01",
      iban: "DE10500105170648489890",
      loanType: "Konsumentenkredit",
      loanAmount: "12000",
      termMonths: "48",
      purpose: "Einrichtung Wohnung",
      pipeline: ["run_scoring", "send_teamlead"]
    },
    {
      firstName: "Leon",
      lastName: "Meier",
      email: "leon.meier@mflb-demo.de",
      address: "Marktstraße 12",
      postalCode: "20095",
      city: "Hamburg",
      employer: "Dockline AG",
      employerVatId: "DE198765432",
      monthlyNetIncome: "4100",
      employedSince: "2017-09-01",
      iban: "DE74500105175407324931",
      loanType: "Konsumentenkredit",
      loanAmount: "8500",
      termMonths: "36",
      purpose: "Fahrzeugkauf",
      pipeline: ["run_scoring", "run_rate", "generate_offer", "send_signature"]
    },
    {
      firstName: "Sarah",
      lastName: "Beck",
      email: "sarah.beck@mflb-demo.de",
      address: "Alte Gasse 8",
      postalCode: "70173",
      city: "Stuttgart",
      employer: "Beck Design Studio",
      employerVatId: "DE345672198",
      monthlyNetIncome: "2850",
      employedSince: "2022-02-01",
      iban: "DE08500105179858451595",
      loanType: "Konsumentenkredit",
      loanAmount: "6500",
      termMonths: "24",
      purpose: "Küchenmodernisierung",
      pipeline: []
    },
    {
      firstName: "David",
      lastName: "Krüger",
      email: "david.krueger@mflb-demo.de",
      address: "Parkallee 91",
      postalCode: "28195",
      city: "Bremen",
      employer: "Krüger Eventtechnik",
      employerVatId: "DE987654321",
      monthlyNetIncome: "4700",
      employedSince: "2016-01-01",
      iban: "DE98500105172429448490",
      loanType: "Konsumentenkredit",
      loanAmount: "30000",
      termMonths: "72",
      purpose: "Freie Verwendung",
      pipeline: []
    },
      {
        firstName: "Miriam",
        lastName: "Yilmaz",
        email: "miriam.yilmaz@mflb-demo.de",
      address: "Schillerplatz 22",
      postalCode: "50667",
      city: "Köln",
      employer: "Urban Habitat GmbH",
      employerVatId: "DE147258369",
      monthlyNetIncome: "5600",
      employedSince: "2015-03-01",
      iban: "DE69500105173648295054",
      loanType: "Baufinanzierung",
        loanAmount: "180000",
        termMonths: "240",
        purpose: "Eigentumswohnung",
        pipeline: []
      },
      {
        firstName: "Robert",
        lastName: "Engel",
        email: "robert.engel@mflb-demo.de",
        address: "Industrieweg 44",
        postalCode: "60311",
        city: "Frankfurt am Main",
        employer: "Engel Maschinenbau SE",
        employerVatId: "DE111222333",
        monthlyNetIncome: "7200",
        employedSince: "2012-11-01",
        iban: "DE97500105170648489810",
        loanType: "Großkredit",
        loanAmount: "250000",
        termMonths: "84",
        purpose: "Expansion Betrieb",
        pipeline: []
      },
      {
        firstName: "Lisa",
        lastName: "Hoffmann",
        email: "lisa.hoffmann@mflb-demo.de",
        address: "Auenweg 27",
        postalCode: "01067",
        city: "Dresden",
        employer: "Hoffmann Consulting",
        employerVatId: "DE444555666",
        monthlyNetIncome: "3900",
        employedSince: "2018-06-01",
        iban: "DE17500105173648295014",
        loanType: "Konsumentenkredit",
        loanAmount: "19800",
        termMonths: "72",
        purpose: "Modernisierung Wohnung",
        pipeline: ["run_scoring", "send_teamlead", "team_approve", "run_rate", "generate_offer"]
      },
      {
        firstName: "Jonas",
        lastName: "Adler",
        email: "jonas.adler@mflb-demo.de",
        address: "Bachstraße 17",
        postalCode: "90402",
        city: "Nürnberg",
        employer: "Adler Systems GmbH",
        employerVatId: "DE333444555",
        monthlyNetIncome: "3600",
        employedSince: "2020-07-01",
        iban: "DE51500105170648555370",
        loanType: "Konsumentenkredit",
        loanAmount: "7200",
        termMonths: "48",
        purpose: "Umschuldung",
        pipeline: ["run_scoring", "run_rate", "generate_offer", "send_signature", "customer_sign", "send_mail"]
      },
      {
        firstName: "Pia",
        lastName: "Weber",
        email: "pia.weber@mflb-demo.de",
        address: "Bahnhofstraße 6",
        postalCode: "04109",
        city: "Leipzig",
        employer: "Weber Media OHG",
        employerVatId: "DE666777888",
        monthlyNetIncome: "3250",
        employedSince: "2021-10-01",
        iban: "DE75500105170648489850",
        loanType: "Konsumentenkredit",
        loanAmount: "9400",
        termMonths: "36",
        purpose: "Freie Verwendung",
        pipeline: ["run_scoring", "run_rate"]
      },
      {
        firstName: "Cem",
        lastName: "Arslan",
        email: "cem.arslan@mflb-demo.de",
      address: "Turmring 9",
      postalCode: "68159",
      city: "Mannheim",
      employer: "LogiChain Europe",
      employerVatId: "DE777888999",
      monthlyNetIncome: "3000",
      employedSince: "2023-01-01",
      iban: "DE28500105170000202051",
      loanType: "Konsumentenkredit",
      loanAmount: "10400",
      termMonths: "48",
      purpose: "Elektronik",
      pipeline: ["run_scoring", "send_teamlead"]
    },
    {
      firstName: "Nora",
      lastName: "Klein",
      email: "nora.klein@mflb-demo.de",
      address: "Rathausgasse 5",
      postalCode: "89073",
      city: "Ulm",
      employer: "Klein Concept Store",
      employerVatId: "DE812345670",
      monthlyNetIncome: "2800",
      employedSince: "2022-06-01",
      iban: "DE91500105170648489910",
      loanType: "Konsumentenkredit",
      loanAmount: "5400",
      termMonths: "24",
      purpose: "Möbelkauf",
      pipeline: []
    },
    {
      firstName: "Tim",
      lastName: "Richter",
      email: "tim.richter@mflb-demo.de",
      address: "Mühlenweg 18",
      postalCode: "44135",
      city: "Dortmund",
      employer: "Richter Elektrotechnik",
      employerVatId: "DE923456781",
      monthlyNetIncome: "3500",
      employedSince: "2019-08-01",
      iban: "DE22500105170648489920",
      loanType: "Konsumentenkredit",
      loanAmount: "15000",
      termMonths: "60",
      purpose: "Renovierung",
      pipeline: ["run_scoring", "send_teamlead"]
    },
    {
      firstName: "Aylin",
      lastName: "Demir",
      email: "aylin.demir@mflb-demo.de",
      address: "Gartenstraße 28",
      postalCode: "30159",
      city: "Hannover",
      employer: "Demir Services GmbH",
      employerVatId: "DE834567892",
      monthlyNetIncome: "3300",
      employedSince: "2021-01-01",
      iban: "DE33500105170648489930",
      loanType: "Konsumentenkredit",
      loanAmount: "9900",
      termMonths: "48",
      purpose: "Umschuldung",
      pipeline: ["run_scoring", "run_rate"]
    },
    {
      firstName: "Marcel",
      lastName: "Vogt",
      email: "marcel.vogt@mflb-demo.de",
      address: "Bergstraße 44",
      postalCode: "53111",
      city: "Bonn",
      employer: "Vogt Logistik AG",
      employerVatId: "DE845678903",
      monthlyNetIncome: "4300",
      employedSince: "2016-04-01",
      iban: "DE44500105170648489940",
      loanType: "Konsumentenkredit",
      loanAmount: "18500",
      termMonths: "72",
      purpose: "Sanierung Hausrat",
      pipeline: ["run_scoring", "send_teamlead", "team_approve", "run_rate", "generate_offer"]
    },
    {
      firstName: "Helena",
      lastName: "Fuchs",
      email: "helena.fuchs@mflb-demo.de",
      address: "Marktplatz 9",
      postalCode: "39104",
      city: "Magdeburg",
      employer: "Fuchs Interior GmbH",
      employerVatId: "DE856789014",
      monthlyNetIncome: "3900",
      employedSince: "2018-11-01",
      iban: "DE55500105170648489950",
      loanType: "Konsumentenkredit",
      loanAmount: "11200",
      termMonths: "48",
      purpose: "Freie Verwendung",
      pipeline: ["run_scoring", "send_teamlead", "team_approve"]
    },
    {
      firstName: "Paul",
      lastName: "Steiner",
      email: "paul.steiner@mflb-demo.de",
      address: "Lindenring 16",
      postalCode: "54290",
      city: "Trier",
      employer: "Steiner IT Solutions",
      employerVatId: "DE867890125",
      monthlyNetIncome: "4100",
      employedSince: "2017-02-01",
      iban: "DE66500105170648489960",
      loanType: "Konsumentenkredit",
      loanAmount: "7800",
      termMonths: "36",
      purpose: "Elektronik",
      pipeline: ["run_scoring", "run_rate", "generate_offer", "send_signature", "customer_sign", "send_mail"]
    },
    {
      firstName: "Farah",
      lastName: "Özdemir",
      email: "farah.oezdemir@mflb-demo.de",
      address: "Kanalweg 2",
      postalCode: "28199",
      city: "Bremen",
      employer: "Özdemir Immobilien",
      employerVatId: "DE878901236",
      monthlyNetIncome: "6800",
      employedSince: "2014-09-01",
      iban: "DE77500105170648489970",
      loanType: "Baufinanzierung",
      loanAmount: "240000",
      termMonths: "300",
      purpose: "Neubau",
      pipeline: []
    },
    {
      firstName: "Martin",
      lastName: "Schade",
      email: "martin.schade@mflb-demo.de",
      address: "Gewerbepark 11",
      postalCode: "97070",
      city: "Würzburg",
      employer: "Schade Produktions GmbH",
      employerVatId: "DE889012347",
      monthlyNetIncome: "7600",
      employedSince: "2013-05-01",
      iban: "DE88500105170648489980",
      loanType: "Großkredit",
      loanAmount: "130000",
      termMonths: "96",
      purpose: "Maschinenpark",
      pipeline: []
    },
    {
      firstName: "Clara",
      lastName: "Neumann",
      email: "clara.neumann@mflb-demo.de",
      address: "Sonnenweg 31",
      postalCode: "18055",
      city: "Rostock",
      employer: "Neumann Healthcare",
      employerVatId: "DE890123458",
      monthlyNetIncome: "4400",
      employedSince: "2019-01-01",
      iban: "DE99500105170648489990",
      loanType: "Konsumentenkredit",
      loanAmount: "22000",
      termMonths: "60",
      purpose: "Freie Verwendung",
      pipeline: []
    },
    {
      firstName: "Deniz",
      lastName: "Kara",
      email: "deniz.kara@mflb-demo.de",
      address: "Fliederweg 14",
      postalCode: "34117",
      city: "Kassel",
      employer: "Kara Media House",
      employerVatId: "DE901234569",
      monthlyNetIncome: "3100",
      employedSince: "2022-09-01",
      iban: "DE11500105170648489001",
      loanType: "Konsumentenkredit",
        loanAmount: "10100",
        termMonths: "48",
        purpose: "Fahrzeugkauf",
        pipeline: ["run_scoring"]
      },
      {
        firstName: "Jana",
        lastName: "Lorenz",
        email: "jana.lorenz@mflb-demo.de",
        address: "Hafenweg 21",
        postalCode: "10115",
        city: "Berlin",
        employer: "Lorenz Office Services",
        employerVatId: "DE912340001",
        monthlyNetIncome: "2950",
        employedSince: "2021-05-01",
        iban: "DE12500105170648489011",
        loanType: "Konsumentenkredit",
        loanAmount: "5800",
        termMonths: "24",
        purpose: "Möblierung",
        pipeline: []
      },
      {
        firstName: "Felix",
        lastName: "Brandt",
        email: "felix.brandt@mflb-demo.de",
        address: "Westend 13",
        postalCode: "45127",
        city: "Essen",
        employer: "Brandt Facility Solutions",
        employerVatId: "DE912340002",
        monthlyNetIncome: "3450",
        employedSince: "2018-02-01",
        iban: "DE13500105170648489012",
        loanType: "Konsumentenkredit",
        loanAmount: "9900",
        termMonths: "36",
        purpose: "Fahrzeugreparatur",
        pipeline: ["run_scoring", "run_rate"]
      },
      {
        firstName: "Sophie",
        lastName: "Albrecht",
        email: "sophie.albrecht@mflb-demo.de",
        address: "Lechufer 7",
        postalCode: "86150",
        city: "Augsburg",
        employer: "Albrecht Medien GmbH",
        employerVatId: "DE912340003",
        monthlyNetIncome: "3800",
        employedSince: "2017-11-01",
        iban: "DE14500105170648489013",
        loanType: "Konsumentenkredit",
        loanAmount: "12500",
        termMonths: "60",
        purpose: "Badsanierung",
        pipeline: ["run_scoring", "send_teamlead"]
      },
      {
        firstName: "Lukas",
        lastName: "Werner",
        email: "lukas.werner@mflb-demo.de",
        address: "Fördeblick 4",
        postalCode: "24103",
        city: "Kiel",
        employer: "Werner Maritim GmbH",
        employerVatId: "DE912340004",
        monthlyNetIncome: "4200",
        employedSince: "2016-09-01",
        iban: "DE15500105170648489014",
        loanType: "Konsumentenkredit",
        loanAmount: "17800",
        termMonths: "72",
        purpose: "Umschuldung",
        pipeline: ["run_scoring", "send_teamlead", "team_approve", "run_rate", "generate_offer"]
      },
      {
        firstName: "Yasmin",
        lastName: "Celik",
        email: "yasmin.celik@mflb-demo.de",
        address: "Rheinbogen 12",
        postalCode: "40213",
        city: "Düsseldorf",
        employer: "Celik Retail Solutions",
        employerVatId: "DE912340005",
        monthlyNetIncome: "3550",
        employedSince: "2020-03-01",
        iban: "DE16500105170648489015",
        loanType: "Konsumentenkredit",
        loanAmount: "8400",
        termMonths: "48",
        purpose: "Hausrat",
        pipeline: ["run_scoring", "run_rate", "generate_offer", "send_signature", "customer_sign", "send_mail"]
      },
      {
        firstName: "Hannes",
        lastName: "Berger",
        email: "hannes.berger@mflb-demo.de",
        address: "Schlossberg 19",
        postalCode: "79098",
        city: "Freiburg",
        employer: "Berger Planungsgesellschaft",
        employerVatId: "DE912340006",
        monthlyNetIncome: "4050",
        employedSince: "2015-10-01",
        iban: "DE17500105170648489016",
        loanType: "Konsumentenkredit",
        loanAmount: "19900",
        termMonths: "84",
        purpose: "Modernisierung",
        pipeline: ["run_scoring", "send_teamlead"]
      },
      {
        firstName: "Bianca",
        lastName: "Roth",
        email: "bianca.roth@mflb-demo.de",
        address: "Südwall 3",
        postalCode: "04103",
        city: "Leipzig",
        employer: "Roth Industrieholding",
        employerVatId: "DE912340007",
        monthlyNetIncome: "8900",
        employedSince: "2011-01-01",
        iban: "DE18500105170648489017",
        loanType: "Großkredit",
        loanAmount: "320000",
        termMonths: "96",
        purpose: "Expansion Filiale",
        pipeline: []
      },
      {
        firstName: "Ole",
        lastName: "Hartmann",
        email: "ole.hartmann@mflb-demo.de",
        address: "Havelpark 8",
        postalCode: "14467",
        city: "Potsdam",
        employer: "Hartmann Architektur PartG",
        employerVatId: "DE912340008",
        monthlyNetIncome: "7600",
        employedSince: "2014-07-01",
        iban: "DE19500105170648489018",
        loanType: "Baufinanzierung",
        loanAmount: "280000",
        termMonths: "300",
        purpose: "Neubau Einfamilienhaus",
        pipeline: []
      },
      {
        firstName: "Greta",
        lastName: "König",
        email: "greta.koenig@mflb-demo.de",
        address: "Seeblick 27",
        postalCode: "18055",
        city: "Rostock",
        employer: "König Eventservice",
        employerVatId: "DE912340009",
        monthlyNetIncome: "3700",
        employedSince: "2019-12-01",
        iban: "DE20500105170648489019",
        loanType: "Konsumentenkredit",
        loanAmount: "22000",
        termMonths: "84",
        purpose: "Freie Verwendung",
        pipeline: []
      },
      {
        firstName: "Sami",
        lastName: "Rahman",
        email: "sami.rahman@mflb-demo.de",
        address: "Europaallee 15",
        postalCode: "66111",
        city: "Saarbrücken",
        employer: "Rahman IT Services",
        employerVatId: "DE912340010",
        monthlyNetIncome: "3150",
        employedSince: "2022-04-01",
        iban: "DE21500105170648489020",
        loanType: "Konsumentenkredit",
        loanAmount: "10100",
        termMonths: "48",
        purpose: "Weiterbildung",
        pipeline: ["run_scoring", "send_teamlead", "team_approve", "run_rate"]
      },
      {
        firstName: "Carina",
        lastName: "Wolf",
        email: "carina.wolf@mflb-demo.de",
        address: "Messeplatz 6",
        postalCode: "50670",
        city: "Köln",
        employer: "Wolf Projektservice",
        employerVatId: "DE912340011",
        monthlyNetIncome: "3275",
        employedSince: "2020-08-01",
        iban: "DE22500105170648489021",
        loanType: "Konsumentenkredit",
        loanAmount: "7600",
        termMonths: "36",
        purpose: "Haushaltsgeräte",
        pipeline: ["scoring_error"]
      },
      {
        firstName: "Mehmet",
        lastName: "Acar",
        email: "mehmet.acar@mflb-demo.de",
        address: "Nordring 42",
        postalCode: "48143",
        city: "Münster",
        employer: "Acar Mobility Services",
        employerVatId: "DE912340012",
        monthlyNetIncome: "3480",
        employedSince: "2018-05-01",
        iban: "DE23500105170648489022",
        loanType: "Konsumentenkredit",
        loanAmount: "6900",
        termMonths: "30",
        purpose: "Motorradkauf",
        pipeline: ["run_scoring", "run_rate", "generate_offer"]
      }
    ];

  definitions.forEach((definition, index) => {
    const createdAt = new Date(Date.UTC(2026, 2, 25, 8, 0 + index * 17)).toISOString();
    const inquiryId = buildInquiryId(index + 1, createdAt);
    const record = createRecordFromDraft(definition, {
      id: `local-${index + 1}`,
      inquiryId,
      createdAt
    });
    appendLocalLog(record, "Website", "Seed-Fall wurde als JSON aus dem Online-Kanal übernommen.");

    definition.pipeline.forEach((step) => {
      if (step === "scoring_error") {
        localRunScoring(record, true);
      } else {
        localHandleAction(record, step);
      }
    });

    localStore.applications.push(record);
  });

  localStore.sequence = localStore.applications.length;
  localStore.applications.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  syncLocalLogs();
}

function localApiRequest(path, options = {}) {
  seedLocalStore();

  if (path === "/api/bootstrap") {
    return Promise.resolve({
      applications: deepClone(localStore.applications),
      logs: deepClone(localStore.logs)
    });
  }

  if (path === "/api/applications" && (options.method || "GET") === "POST") {
    const payload = JSON.parse(options.body || "{}");
    const validation = validateDraft(payload);
    if (!validation.valid) {
      return Promise.reject(new Error(validation.message));
    }
    localStore.sequence += 1;
    const createdAt = new Date().toISOString();
    const inquiryId = buildInquiryId(localStore.sequence, createdAt);
    const record = createRecordFromDraft(payload, {
      id: `local-${localStore.sequence}`,
      inquiryId,
      createdAt
    });
    appendLocalLog(record, "Website", "Neuer Online-Antrag wurde als JSON aus der Website übernommen.");
    localStore.applications.unshift(record);
    syncLocalLogs();
    return Promise.resolve({
      applications: deepClone(localStore.applications),
      logs: deepClone(localStore.logs)
    });
  }

  const match = path.match(/^\/api\/applications\/([^/]+)\/actions\/([^/]+)$/);
  if (match && (options.method || "GET") === "POST") {
    const [, recordId, action] = match;
    const record = localStore.applications.find((item) => item.id === recordId);
    if (!record) {
      return Promise.reject(new Error("Fall wurde nicht gefunden."));
    }
    localHandleAction(record, action);
    syncLocalLogs();
    return Promise.resolve({
      applications: deepClone(localStore.applications),
      logs: deepClone(localStore.logs)
    });
  }

  return Promise.reject(new Error("Lokale Demo-Route nicht gefunden."));
}

function getTimelineSteps(record) {
  if (!record) {
    return [];
  }

  const teamStepState = !record.teamleadRequired
    ? "skipped"
    : record.teamleadDecision === "Freigegeben"
      ? "complete"
      : record.teamleadDecision === "Ausstehend"
        ? "current"
        : record.teamleadDecision === "Abgelehnt"
          ? "danger"
          : record.teamleadDecision === "Rückfrage"
            ? "current"
            : "pending";

  return [
    {
      title: "Antrag eingegangen",
      description: "Online-Antrag wurde als JSON aus der Website übernommen.",
      state: "complete"
    },
    {
      title: "Vorprüfung / Routing",
      description: record.routeMessage,
      state: "complete"
    },
    {
      title: "Bonitätsprüfung",
      description:
        record.scoringStatus === "Abgeschlossen"
          ? `Score ${record.score} · Risikoklasse ${record.riskClass}.`
          : record.scoringStatus === "Fehler"
            ? "Scoring-REST-Schnittstelle konnte nicht verarbeitet werden."
            : "Scoring-Modul nutzt XML als Austauschformat.",
      state:
        record.scoringStatus === "Abgeschlossen"
          ? "complete"
          : record.scoringStatus === "Fehler"
            ? "danger"
            : "pending"
    },
    {
      title: "Teamleiterfreigabe",
      description: record.teamleadRequired
        ? "Ab 10.000 € ist eine Freigabe durch die Teamleitung erforderlich."
        : "Für diesen Antrag nicht erforderlich.",
      state: teamStepState
    },
    {
      title: "Angebotsberechnung",
      description:
        record.rateCalculationStatus === "Abgeschlossen"
          ? `Monatsrate ${formatCurrency(record.monthlyRate, 2)} bei ${String(record.interestRate).replace(".", ",")} % Sollzins.`
          : "Zinsrechner nutzt ein separates JSON-Schema.",
      state: record.rateCalculationStatus === "Abgeschlossen" ? "complete" : "pending"
    },
    {
      title: "Dokument & Signatur",
      description:
        record.signatureStatus === "Signiert"
          ? "Dokument wurde erstellt und signiert."
          : record.signatureStatus === "Zur Signatur gesendet"
            ? "Dokument liegt beim Signaturdienst."
            : "Dokument wird nach Angebotsberechnung erzeugt.",
      state:
        record.signatureStatus === "Signiert"
          ? "complete"
          : record.signatureStatus === "Zur Signatur gesendet"
            ? "current"
            : "pending"
    },
    {
      title: "Mail & Archiv",
      description:
        record.archiveStatus === "Archiviert"
          ? "Versendet und archiviert."
          : "Versand und Archivierung folgen nach Signatur.",
      state: record.archiveStatus === "Archiviert" ? "complete" : "pending"
    }
  ];
}

function createTimelineItem(step, index) {
  const item = createElement("li", {
    className: `timeline-item ${step.state ? `is-${step.state}` : ""}`.trim()
  });
  const indexNode = createElement("span", { className: "timeline-index", text: String(index + 1) });
  const content = createElement("div", { className: "timeline-content" });
  const top = createElement("div", { className: "timeline-top" });

  top.appendChild(createElement("h4", { text: step.title }));
  top.appendChild(
    createStatusChip(
      step.state === "complete"
        ? "Abgeschlossen"
        : step.state === "current"
          ? "In Prüfung"
          : step.state === "danger"
            ? "Fehler"
            : step.state === "skipped"
              ? "Nicht erforderlich"
              : "Ausstehend"
    )
  );

  content.appendChild(top);
  content.appendChild(createElement("p", { text: step.description }));
  item.append(indexNode, content);
  return item;
}

  function setBackendState(mode = "offline", message = "") {
    state.backendConnected = mode === "connected";
    state.transportMode = mode === "local" ? "local" : "remote";

    if (refs.backendPill) {
      refs.backendPill.hidden = true;
    }

  if (refs.banner) {
    refs.banner.hidden = mode !== "offline";
    refs.banner.textContent = message;
  }
}

async function apiRequest(path, options = {}) {
  if (state.transportMode === "local") {
    return localApiRequest(path, options);
  }

  const requestUrl = `${apiBaseUrl}${path}`;

  try {
    const response = await fetch(requestUrl, {
      headers: {
        "Content-Type": "application/json"
      },
      ...options
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const detail = payload.detail || "Unbekannter Fehler";
      throw new Error(detail);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError || error.message === "Failed to fetch") {
      setBackendState("local");
      return localApiRequest(path, options);
    }
    throw error;
  }
}

async function loadBootstrap(preserveSelection = true) {
  const previousSelection = state.selectedId;

  try {
    const payload = await apiRequest("/api/bootstrap");
    state.applications = payload.applications || [];
    state.logs = payload.logs || [];

    if (preserveSelection && state.applications.some((record) => record.id === previousSelection)) {
      state.selectedId = previousSelection;
    } else {
      state.selectedId = state.applications[0] ? state.applications[0].id : null;
    }

    setBackendState("connected", "");
    renderApp();
  } catch (error) {
    if (state.transportMode === "local") {
      renderApp();
      return;
    }

    setBackendState(
      "offline",
      `Das FastAPI-Backend ist aktuell nicht erreichbar. Starte die Demo mit "uvicorn app:app --reload" im Projektordner. (${error.message})`
    );
    renderApp();
  }
}

  async function submitApplication() {
  const payload = {
    ...state.customerDraft,
    monthlyNetIncome: toNumber(state.customerDraft.monthlyNetIncome),
    loanAmount: toNumber(state.customerDraft.loanAmount),
    termMonths: toNumber(state.customerDraft.termMonths)
  };

  const result = await apiRequest("/api/applications", {
    method: "POST",
    body: JSON.stringify(payload)
  });

    state.applications = result.applications || [];
    state.logs = result.logs || [];
    state.selectedId = state.applications[0] ? state.applications[0].id : null;
    state.customerRecordId = state.applications[0] ? state.applications[0].id : null;
    refs.customer.feedback.textContent = "Antrag wurde im Prozess angelegt und an die Worklist übergeben.";
    setBackendState(state.transportMode === "local" ? "local" : "connected", "");
    renderApp();
  }

async function runAction(action, recordId) {
  const result = await apiRequest(`/api/applications/${recordId}/actions/${action}`, {
    method: "POST"
  });

  state.applications = result.applications || [];
  state.logs = result.logs || [];
  state.selectedId = recordId;
  if (action === "customer_sign") {
    state.customerRecordId = recordId;
    refs.customer.feedback.textContent = "Digitale Signatur wurde abgeschlossen.";
  }
  setBackendState(state.transportMode === "local" ? "local" : "connected", "");
  renderApp();
}

  function renderCustomer() {
    const record = getCustomerRecord();
    const validation = validateDraft(state.customerDraft);

  refs.customer.validation.textContent = validation.message;
  refs.customer.validation.className = `notice notice-${validation.tone || (validation.valid ? "info" : "danger")}`;
  refs.customer.collateral.hidden = Boolean(validation.hardBlock);
  refs.customer.collateral.textContent = validation.hardBlock ? "" : getCollateralNote(state.customerDraft);
  refs.customer.json.textContent = JSON.stringify(buildWebsitePreviewPayload(state.customerDraft), null, 2);
  refs.customer.activeInquiry.textContent = record ? record.inquiryId : "Noch kein Antrag";
  applyHeaderStatus(refs.customer.activeStatus, record ? record.overallStatus : "Nicht gestartet");

  if (refs.customer.submit) {
    refs.customer.submit.disabled = !validation.valid;
  }

  clearNode(refs.customer.summary);
  clearNode(refs.customer.actions);
  clearNode(refs.customer.timeline);

    if (!record) {
      refs.customer.summary.appendChild(
        createEmptyState("Sobald du den Antrag absendest, erscheint hier der angelegte Fall mit seinen Fachinformationen.")
      );
      refs.customer.timeline.appendChild(
        createEmptyState("Der Prozess startet erst nach dem Absenden des Online-Antrags.")
      );
      return;
    }

  refs.customer.summary.append(
    createDetailItem("Antragsteller", `${record.firstName} ${record.lastName}`, record.email),
    createDetailItem("Produkt", record.loanType, `${formatCurrency(record.loanAmount)} · ${record.termMonths} Monate`),
    createDetailItem("Abteilung", record.department, getPhaseLabel(record)),
    createDetailItem(
      "Teamleiterregel",
      record.teamleadRequired ? "Erforderlich" : "Nicht erforderlich",
      "Ab 10.000 € fachlich verpflichtend"
    ),
    createDetailItem(
      "Scoring",
      record.score ? `${record.score}` : "Noch nicht gestartet",
      record.riskClass !== "–" ? `Risikoklasse ${record.riskClass}` : record.scoringStatus
    ),
    createDetailItem(
      "Angebot",
      record.monthlyRate ? formatCurrency(record.monthlyRate, 2) : "Noch nicht berechnet",
      record.rateCalculationStatus
    ),
    createDetailItem(
      "Dokument & Signatur",
      record.signatureStatus,
      record.mailStatus === "Versendet" ? "Abschluss-Mail wurde bereits versendet." : "Kunde signiert digital im Kundenportal."
    )
  );

  if (record.signatureStatus === "Zur Signatur gesendet" && record.mailStatus !== "Versendet") {
    refs.customer.actions.appendChild(
      createElement("button", {
        className: "btn btn-primary",
        text: "Digital signieren",
        type: "button",
        dataset: {
          recordAction: "customer_sign",
          recordId: record.id
        }
      })
    );
  } else if (record.signatureStatus === "Signiert") {
    refs.customer.actions.appendChild(
      createElement("button", {
        className: "btn btn-secondary",
        text: "Signatur abgeschlossen",
        type: "button",
        disabled: true
      })
    );
  }

  getTimelineSteps(record).forEach((step, index) => {
    refs.customer.timeline.appendChild(createTimelineItem(step, index));
  });
}

function renderSachbearbeitung() {
  const record = getSelectedRecord();
  const worklist = state.applications.filter(
    (item) => item.overallStatus !== "Abgeschlossen" && item.overallStatus !== "Abgelehnt"
  );

  refs.sach.activeInquiry.textContent = record ? record.inquiryId : "–";
  applyHeaderStatus(refs.sach.count, `${worklist.length} offen`);
  applyHeaderStatus(refs.sach.overallStatus, record ? record.overallStatus : "Bereit");

  clearNode(refs.sach.table);
  clearNode(refs.sach.detailGrid);
  clearNode(refs.sach.routing);
  clearNode(refs.sach.processing);
  clearNode(refs.sach.actions);

  if (worklist.length === 0) {
    refs.sach.table.appendChild(createEmptyState("Aktuell befinden sich keine offenen Fälle in der Worklist."));
  } else {
    worklist.forEach((item) => {
      refs.sach.table.appendChild(
        createSelectableRow(
          item,
          "table-worklist-row",
          [
            {
              main: item.inquiryId,
              subtext: formatDateTime(item.createdAt)
            },
            {
              main: `${item.firstName} ${item.lastName}`,
              subtext: item.department
            },
            {
              main: item.loanType,
              subtext: formatCurrency(item.loanAmount)
            },
            {
              main: "",
              extraNode: createStatusChip(item.overallStatus)
            }
          ],
          record ? record.id === item.id : false
        )
      );
    });
  }

  if (!record) {
    refs.sach.detailGrid.appendChild(createEmptyState("Kein Fall ausgewählt."));
    return;
  }

  refs.sach.detailGrid.append(
    createDetailItem("Kunde", `${record.firstName} ${record.lastName}`, `${record.postalCode} ${record.city}`),
    createDetailItem("Antrag", record.loanType, `${formatCurrency(record.loanAmount)} · ${record.termMonths} Monate`),
    createDetailItem("Verwendungszweck", record.purpose),
    createDetailItem("Vollständigkeit", record.completenessStatus, "Pflichtfelder werden bereits auf der Website geprüft"),
    createDetailItem("Arbeitgeber", record.employer, `USt-Id: ${record.employerVatId}`),
    createDetailItem("Aktueller Besitzer", record.currentOwner)
  );

  refs.sach.routing.append(
    createNotice(record.routeMessage, "info"),
    createNotice(
      record.teamleadRequired
        ? "Teamleiterfreigabe erforderlich, weil der Betrag mindestens 10.000 € beträgt."
        : "Keine Teamleiterfreigabe erforderlich.",
      record.teamleadRequired ? "warning" : "success"
    )
  );

  refs.sach.processing.append(
    createDetailItem("Scoring-Status", record.scoringStatus),
    createDetailItem("Score", record.score ? `${record.score}` : "–", record.riskClass !== "–" ? `Risikoklasse ${record.riskClass}` : "Noch kein Ergebnis"),
    createDetailItem("Teamleitung", record.teamleadDecision),
    createDetailItem("Zinsberechnung", record.rateCalculationStatus),
    createDetailItem("Dokument", record.documentStatus),
    createDetailItem("Signatur / Mail", `${record.signatureStatus} / ${record.mailStatus}`)
  );

  [
    {
      label: "Scoring ausführen",
      action: "run_scoring",
      variant: "btn-primary",
      disabled: !record.supportedInPhaseOne || record.invalidProductRange || record.scoringStatus === "Abgeschlossen"
    },
    {
      label: "Zins berechnen",
      action: "run_rate",
      variant: "btn-secondary",
      disabled:
        record.scoringStatus !== "Abgeschlossen" ||
        (record.teamleadRequired && record.teamleadDecision !== "Freigegeben") ||
        !record.supportedInPhaseOne ||
        record.rateCalculationStatus === "Abgeschlossen"
    },
    {
      label: "An Teamleitung senden",
      action: "send_teamlead",
      variant: "btn-secondary",
      disabled:
        !record.teamleadRequired ||
        record.scoringStatus !== "Abgeschlossen" ||
        record.teamleadDecision !== "Nicht gestartet"
    },
    {
      label: "Angebot erzeugen",
      action: "generate_offer",
      variant: "btn-secondary",
      disabled:
        record.scoringStatus !== "Abgeschlossen" ||
        (record.teamleadRequired && record.teamleadDecision !== "Freigegeben") ||
        !record.supportedInPhaseOne ||
        record.offerStatus === "Angebot erstellt"
    },
    {
      label: "Zur Signatur senden",
      action: "send_signature",
      variant: "btn-secondary",
      disabled: record.offerStatus !== "Angebot erstellt" || record.signatureStatus !== "Nicht gestartet"
    },
    {
      label: "Mail versenden",
      action: "send_mail",
      variant: "btn-secondary",
      disabled:
        record.offerStatus !== "Angebot erstellt" ||
        record.signatureStatus !== "Signiert" ||
        record.mailStatus === "Versendet"
    }
  ].forEach((config) => {
    refs.sach.actions.appendChild(
      createElement("button", {
        className: `btn ${config.variant}`,
        text: config.label,
        type: "button",
        disabled: config.disabled,
        dataset: {
          recordAction: config.action,
          recordId: record.id
        }
      })
    );
  });
}

function renderTeamleitung() {
  const queue = getTeamQueue();
  const queueRecord = queue.find((item) => item.id === state.selectedId) || queue[0] || null;

  refs.team.activeInquiry.textContent = queueRecord ? queueRecord.inquiryId : "–";
  applyHeaderStatus(refs.team.count, `${queue.length} ausstehend`);
  applyHeaderStatus(refs.team.decisionStatus, queueRecord ? queueRecord.teamleadDecision : "Bereit");

  clearNode(refs.team.queue);
  clearNode(refs.team.detailGrid);
  clearNode(refs.team.guidance);
  clearNode(refs.team.actions);

  if (queue.length === 0) {
    refs.team.queue.appendChild(createEmptyState("Aktuell liegen keine Fälle für die Teamleitung vor."));
  } else {
    queue.forEach((item) => {
      refs.team.queue.appendChild(
        createSelectableRow(
          item,
          "table-team-row",
          [
            {
              main: item.inquiryId,
              subtext: formatCurrency(item.loanAmount)
            },
            {
              main: `${item.firstName} ${item.lastName}`,
              subtext: item.loanType
            },
            {
              main: item.score ? `${item.score}` : "–",
              subtext: `Risiko ${item.riskClass}`
            },
            {
              main: "",
              extraNode: createStatusChip("Teamleitung")
            }
          ],
          queueRecord ? queueRecord.id === item.id : false
        )
      );
    });
  }

  if (!queueRecord) {
    refs.team.detailGrid.appendChild(createEmptyState("Kein Freigabefall ausgewählt."));
    refs.team.guidance.appendChild(
      createNotice("Sobald ein Fall ab 10.000 € an die Teamleitung übergeben wird, erscheint er hier.", "info")
    );
    return;
  }

  refs.team.detailGrid.append(
    createDetailItem("Kunde", `${queueRecord.firstName} ${queueRecord.lastName}`),
    createDetailItem("Kreditrahmen", formatCurrency(queueRecord.loanAmount), `${queueRecord.termMonths} Monate`),
    createDetailItem("Scoring", queueRecord.score ? `${queueRecord.score}` : "–", `Risikoklasse ${queueRecord.riskClass}`),
    createDetailItem("Abteilung", queueRecord.department),
    createDetailItem(
      "Konditionen",
      queueRecord.monthlyRate ? formatCurrency(queueRecord.monthlyRate, 2) : "Noch nicht berechnet",
      queueRecord.interestRate ? `${String(queueRecord.interestRate).replace(".", ",")} % Sollzins` : "Zinsrechner folgt nach Freigabe"
    ),
    createDetailItem("Empfehlung", queueRecord.score && queueRecord.score >= 680 ? "Freigabe fachlich plausibel" : "Manuelle Prüfung empfohlen")
  );

  refs.team.guidance.append(
    createNotice("Über 10.000 € muss die Teamleitung zustimmen.", "warning")
  );

  [
    {
      label: "Freigeben",
      action: "team_approve",
      variant: "btn-primary"
    },
    {
      label: "Ablehnen",
      action: "team_reject",
      variant: "btn-danger"
    }
  ].forEach((config) => {
    refs.team.actions.appendChild(
      createElement("button", {
        className: `btn ${config.variant}`,
        text: config.label,
        type: "button",
        dataset: {
          recordAction: config.action,
          recordId: queueRecord.id
        }
      })
    );
  });
}

function renderIntegration() {
  const record = getSelectedRecord();

  refs.integration.inquiry.textContent = record ? record.inquiryId : "–";
  applyHeaderStatus(refs.integration.status, record ? record.integration.technicalStatus : "Bereit");

  clearNode(refs.integration.monitor);
  clearNode(refs.integration.log);

  if (!record) {
    refs.integration.monitor.appendChild(createEmptyState("Kein technischer Fall ausgewählt."));
    refs.integration.log.appendChild(createEmptyState("Noch keine technischen Logs verfügbar."));
    refs.integration.panelTitle.textContent = integrationTabs[state.integrationTab].title;
    refs.integration.code.textContent = "";
    return;
  }

  [
    {
      title: "Website-Input",
      description: "Website liefert den Antrag als JSON im Vertrag der Aufgabenstellung.",
      status: "Empfangen"
    },
    {
      title: "Scoring-REST",
      description: "Internes Modell wird in Scoring-XML transformiert und als XML beantwortet.",
      status: record.scoringStatus === "Nicht gestartet" ? "Bereit" : record.scoringStatus
    },
    {
      title: "RateCalculator-REST",
      description: "Separates JSON-Schema für Monatsrate und Angebotskonditionen.",
      status: record.rateCalculationStatus === "Nicht gestartet" ? "Bereit" : record.rateCalculationStatus
    },
    {
      title: "Dokument / Signatur / Mail",
      description: "Nachgelagerte Prozessschritte für Angebot, Signatur und Versand.",
      status: record.mailStatus === "Versendet" ? "Abgeschlossen" : record.signatureStatus
    }
  ].forEach((item) => {
    const row = createElement("div", { className: "monitor-item" });
    const copy = createElement("div", { className: "monitor-copy" });
    copy.appendChild(createElement("strong", { text: item.title }));
    copy.appendChild(createElement("span", { text: item.description }));
    row.append(copy, createStatusChip(item.status));
    refs.integration.monitor.appendChild(row);
  });

  const technicalLogs = record.logs && record.logs.length > 0 ? record.logs : state.logs;
  technicalLogs.slice(0, 8).forEach((entry) => {
    refs.integration.log.appendChild(createLogItem(entry));
  });

  refs.integration.note.className = `notice ${record.integration.errorMessage ? "notice-danger" : "notice-info"}`;
  refs.integration.note.textContent = record.integration.errorMessage
    ? record.integration.errorMessage
    : "Die Panels zeigen die Transformationen zwischen Website-JSON, Scoring-XML und RateCalculator-JSON für den ausgewählten Fall.";

  refs.integration.panelTitle.textContent = integrationTabs[state.integrationTab].title;
  refs.integration.code.textContent = integrationTabs[state.integrationTab].getContent(record);

  refs.integration.tabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.integrationTab === state.integrationTab);
  });
}

function getFilteredAuditRecords() {
  const nameFilter = normalizeText(state.auditFilters.name);
  const inquiryFilter = normalizeText(state.auditFilters.inquiryId);
  const statusFilter = state.auditFilters.status;

  return state.applications.filter((record) => {
    const matchesName =
      !nameFilter || normalizeText(`${record.firstName} ${record.lastName}`).includes(nameFilter);
    const matchesInquiry =
      !inquiryFilter || normalizeText(record.inquiryId).includes(inquiryFilter);
    const matchesStatus = statusFilter === "alle" || record.overallStatus === statusFilter;

    return matchesName && matchesInquiry && matchesStatus;
  });
}

function renderAudit() {
  const records = getFilteredAuditRecords();
  const selected = records.find((item) => item.id === state.selectedId) || records[0] || null;

  applyHeaderStatus(refs.audit.count, `${records.length} Treffer`);
  clearNode(refs.audit.table);
  clearNode(refs.audit.detailGrid);
  clearNode(refs.audit.documents);

  if (records.length === 0) {
    refs.audit.table.appendChild(createEmptyState("Keine Treffer für die gesetzten Filter."));
    refs.audit.detailGrid.appendChild(createEmptyState("Bitte Filter anpassen."));
    refs.audit.documents.appendChild(createEmptyState("Keine Dokumente sichtbar."));
    return;
  }

  records.forEach((record) => {
    refs.audit.table.appendChild(
      createSelectableRow(
        record,
        "table-audit-row",
        [
          {
            main: record.inquiryId,
            subtext: formatDateTime(record.createdAt)
          },
          {
            main: `${record.firstName} ${record.lastName}`,
            subtext: `${record.postalCode} ${record.city}`
          },
          {
            main: record.loanType,
            subtext: `${formatCurrency(record.loanAmount)} · ${record.department}`
          },
          {
            main: "",
            extraNode: createStatusChip(record.overallStatus)
          }
        ],
        selected ? record.id === selected.id : false
      )
    );
  });

  if (!selected) {
    refs.audit.detailGrid.appendChild(createEmptyState("Kein Fall ausgewählt."));
    return;
  }

  const details = [
    ["Anfrage-ID", selected.inquiryId],
    ["Vorname", selected.firstName],
    ["Nachname", selected.lastName],
    ["E-Mail", selected.email],
    ["Adresse", selected.address],
    ["PLZ", selected.postalCode],
    ["Ort", selected.city],
    ["Arbeitgeber", selected.employer],
    ["Arbeitgeber USt-Id", selected.employerVatId],
    ["Beschäftigt seit", formatDate(selected.employedSince)],
    ["IBAN", selected.iban],
    ["Kreditart", selected.loanType],
    ["Kreditsumme", formatCurrency(selected.loanAmount)],
    ["Laufzeit", `${selected.termMonths} Monate`],
    ["Verwendungszweck", selected.purpose],
    ["Abteilung", selected.department],
    ["Vollständigkeit", selected.completenessStatus],
    ["Scoring-Status", selected.scoringStatus],
    ["Score", selected.score ? `${selected.score}` : "–"],
    ["Risikoklasse", selected.riskClass],
    ["Teamleiterpflicht", selected.teamleadRequired ? "Ja" : "Nein"],
    ["Teamleiterentscheidung", selected.teamleadDecision],
    ["Zinsberechnung", selected.rateCalculationStatus],
    ["Monatsrate", selected.monthlyRate ? formatCurrency(selected.monthlyRate, 2) : "–"],
    ["Angebotsstatus", selected.offerStatus],
    ["Signaturstatus", selected.signatureStatus],
    ["Mailstatus", selected.mailStatus],
    ["Gesamtstatus", selected.overallStatus]
  ];

  details.forEach(([label, value]) => {
    refs.audit.detailGrid.appendChild(createDetailItem(label, value));
  });

  selected.documents.forEach((document) => {
    refs.audit.documents.appendChild(
      createDetailItem(document.name, document.status, document.detail)
    );
  });
}

function renderApp() {
  renderCustomer();
  renderSachbearbeitung();
  renderTeamleitung();
  renderIntegration();
  renderAudit();
}

function fillCustomerForm() {
  if (!refs.customer.form) {
    return;
  }

  Array.from(refs.customer.form.elements).forEach((element) => {
    if (element.name && state.customerDraft[element.name] !== undefined) {
      element.value = state.customerDraft[element.name];
    }
  });
}

function syncDraftFromForm() {
  if (!refs.customer.form) {
    return;
  }

  Array.from(refs.customer.form.elements).forEach((element) => {
    if (element.name) {
      state.customerDraft[element.name] = element.value;
    }
  });
}

  function resetCustomerForm() {
    state.customerDraft = { ...formDefaults };
    state.customerRecordId = null;
    refs.customer.feedback.textContent = "";
    fillCustomerForm();
    renderCustomer();
  }

function syncSidebarToggle() {
  if (!refs.appShell || !refs.sidebarToggle) {
    return;
  }

  const collapsed = refs.appShell.classList.contains("is-sidebar-collapsed");
  refs.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  refs.sidebarToggle.setAttribute(
    "aria-label",
    collapsed ? "Navigation ausklappen" : "Navigation einklappen"
  );
}

function activateView(viewId) {
  state.activeView = refs.views.some((view) => view.id === viewId) ? viewId : defaultViewId;

  refs.views.forEach((view) => {
    view.hidden = view.id !== state.activeView;
  });

  refs.navItems.forEach((item) => {
    const active = item.dataset.viewTarget === state.activeView;
    item.classList.toggle("is-active", active);
    if (active) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

function bindEvents() {
  if (refs.sidebarToggle) {
    refs.sidebarToggle.addEventListener("click", () => {
      refs.appShell.classList.toggle("is-sidebar-collapsed");
      syncSidebarToggle();
    });
  }

  refs.navItems.forEach((button) => {
    button.addEventListener("click", () => {
      activateView(button.dataset.viewTarget);
    });
  });

  if (refs.customer.form) {
    refs.customer.form.addEventListener("input", () => {
      syncDraftFromForm();
      renderCustomer();
    });

    refs.customer.form.addEventListener("change", () => {
      syncDraftFromForm();
      renderCustomer();
    });

    refs.customer.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      syncDraftFromForm();
      const validation = validateDraft(state.customerDraft);

      if (!validation.valid) {
        refs.customer.feedback.textContent = validation.message;
        renderCustomer();
        return;
      }

      try {
        await submitApplication();
      } catch (error) {
        refs.customer.feedback.textContent = `Antrag konnte nicht angelegt werden: ${error.message}`;
        setBackendState("offline", `Das Backend meldet einen Fehler: ${error.message}`);
      }
    });
  }

  if (refs.customer.reset) {
    refs.customer.reset.addEventListener("click", resetCustomerForm);
  }

  [refs.audit.nameFilter, refs.audit.inquiryFilter, refs.audit.statusFilter]
    .filter(Boolean)
    .forEach((element) => {
      element.addEventListener("input", () => {
        state.auditFilters.name = refs.audit.nameFilter.value.trim();
        state.auditFilters.inquiryId = refs.audit.inquiryFilter.value.trim();
        state.auditFilters.status = refs.audit.statusFilter.value;
        renderAudit();
      });
      element.addEventListener("change", () => {
        state.auditFilters.name = refs.audit.nameFilter.value.trim();
        state.auditFilters.inquiryId = refs.audit.inquiryFilter.value.trim();
        state.auditFilters.status = refs.audit.statusFilter.value;
        renderAudit();
      });
    });

  refs.integration.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.integrationTab = button.dataset.integrationTab;
      renderIntegration();
    });
  });

  document.addEventListener("click", async (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const actionButton = target.closest("[data-record-action]");
    if (actionButton) {
      try {
        await runAction(actionButton.dataset.recordAction, actionButton.dataset.recordId);
      } catch (error) {
        setBackendState("offline", `Aktion konnte nicht ausgeführt werden: ${error.message}`);
      }
      return;
    }

    const selectionButton = target.closest("[data-select-record]");
    if (selectionButton) {
      state.selectedId = selectionButton.dataset.selectRecord;
      renderApp();
    }
  });
}

function init() {
  fillCustomerForm();
  bindEvents();
  syncSidebarToggle();
  activateView(defaultViewId);
  renderApp();
  loadBootstrap();
}

init();
