import { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  AlertTriangle, 
  PlusCircle, 
  MinusCircle, 
  CheckCircle, 
  FileText, 
  Download, 
  Upload, 
  RefreshCw, 
  Search, 
  ShieldAlert, 
  Copy, 
  Check, 
  HelpCircle,
  FileCheck2,
  Info
} from 'lucide-react';
import yaml from 'js-yaml';
import { jsPDF } from 'jspdf';

// Define the sample configurations requested by the user
const SAMPLE_DEV = `{
  "port": 8080,
  "debug": true,
  "ssl_enabled": true,
  "db_max_connections": 100,
  "api_timeout": 5000,
  "allowed_origins": [
    "http://localhost:3000",
    "*"
  ],
  "log_level": "verbose",
  "security_headers": true
}`;

const SAMPLE_PROD = `{
  "port": 9090,
  "debug": false,
  "ssl_enabled": true,
  "db_max_connections": 50,
  "api_timeout": 15000,
  "allowed_origins": [
    "https://app.prod.company.com"
  ],
  "log_level": "error"
}`;

// Helper: Flatten nested objects into dot-notated paths
const flattenObject = (obj, prefix = '') => {
  let result = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value, newKey));
      } else {
        result[newKey] = value;
      }
    }
  }
  return result;
};

function App() {
  // Bubbles state for ocean theme background
  const [bubbles, setBubbles] = useState([]);
  
  // App workflow state
  const [devInput, setDevInput] = useState(SAMPLE_DEV);
  const [prodInput, setProdInput] = useState(SAMPLE_PROD);
  const [devError, setDevError] = useState(null);
  const [prodError, setProdError] = useState(null);
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Results & Interactive states
  const [driftData, setDriftData] = useState([]);
  const [kpis, setKpis] = useState({ total: 0, modified: 0, added: 0, removed: 0 });
  const [healthScore, setHealthScore] = useState(100);
  const [riskLevel, setRiskLevel] = useState('Low');
  const [filterType, setFilterType] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  // UI helper states
  const [copiedDev, setCopiedDev] = useState(false);
  const [copiedProd, setCopiedProd] = useState(false);
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'paste'
  
  // Refs for scrolling to results
  const resultsRef = useRef(null);
  const compareRef = useRef(null);

  // Initialize background bubble properties once
  useEffect(() => {
    const generated = Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 98}%`,
      size: `${Math.random() * 45 + 15}px`,
      delay: `${Math.random() * 12}s`,
      duration: `${Math.random() * 15 + 12}s`,
    }));
    setBubbles(generated);
  }, []);

  // Parse configurations helper
  const parseConfig = (text) => {
    if (!text || !text.trim()) {
      return { valid: false, error: 'Configuration is empty.' };
    }
    
    // Attempt JSON parsing
    try {
      const data = JSON.parse(text);
      return { valid: true, format: 'JSON', data };
    } catch (jsonErr) {
      // Attempt YAML parsing
      try {
        const data = yaml.load(text);
        if (typeof data !== 'object' || data === null) {
          return { valid: false, error: 'Root must be a JSON object or YAML mapping.' };
        }
        return { valid: true, format: 'YAML', data };
      } catch (yamlErr) {
        return { valid: false, error: 'Invalid format. Paste valid JSON or YAML.' };
      }
    }
  };

  // Run initial parsing on mount to display sample state if requested
  useEffect(() => {
    handleAnalyze(true); // silent run for preloaded values
  }, []);

  // Comparison logic
  const handleAnalyze = (isSilent = false) => {
    if (!isSilent) {
      setIsAnalyzing(true);
    }
    
    setDevError(null);
    setProdError(null);
    
    const parsedDev = parseConfig(devInput);
    const parsedProd = parseConfig(prodInput);
    
    let hasError = false;
    if (!parsedDev.valid) {
      setDevError(parsedDev.error);
      hasError = true;
    }
    if (!parsedProd.valid) {
      setProdError(parsedProd.error);
      hasError = true;
    }
    
    if (hasError) {
      setIsAnalyzing(false);
      return;
    }

    // Flatten configurations for comparative key-value analysis
    const devFlat = flattenObject(parsedDev.data);
    const prodFlat = flattenObject(parsedProd.data);
    
    const allKeys = Array.from(new Set([...Object.keys(devFlat), ...Object.keys(prodFlat)]));
    
    const results = allKeys.map(key => {
      const devVal = devFlat[key];
      const prodVal = prodFlat[key];
      const devExists = key in devFlat;
      const prodExists = key in prodFlat;
      
      let status = '';
      let devStrVal = devExists ? JSON.stringify(devVal) : '';
      let prodStrVal = prodExists ? JSON.stringify(prodVal) : '';
      
      // Clean up stringified outputs for display
      if (devExists && typeof devVal !== 'object') devStrVal = String(devVal);
      if (prodExists && typeof prodVal !== 'object') prodStrVal = String(prodVal);
      
      if (devExists && !prodExists) {
        status = 'Removed'; // present in Dev, missing in Prod
      } else if (!devExists && prodExists) {
        status = 'Added'; // missing in Dev, present in Prod
      } else if (JSON.stringify(devVal) === JSON.stringify(prodVal)) {
        status = 'Identical';
      } else {
        status = 'Modified';
      }
      
      // Rule-based severity rating
      let severity = 'Low';
      if (status === 'Modified' || status === 'Removed' || status === 'Added') {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('debug') || 
          lowerKey.includes('ssl') || 
          lowerKey.includes('allowed_origins') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('key') ||
          lowerKey.includes('password') ||
          lowerKey.includes('token') ||
          lowerKey.includes('security')
        ) {
          severity = 'High';
        } else if (
          lowerKey.includes('port') || 
          lowerKey.includes('timeout') || 
          lowerKey.includes('host') || 
          lowerKey.includes('connection') ||
          lowerKey.includes('log_level')
        ) {
          severity = 'Medium';
        }
      }
      
      return {
        key,
        devValue: devStrVal,
        prodValue: prodStrVal,
        rawDevValue: devVal,
        rawProdValue: prodVal,
        severity,
        status
      };
    });

    // Sort: High Severity -> Medium Severity -> Low Severity -> Key name alphabetically
    const severityWeight = { High: 3, Medium: 2, Low: 1 };
    results.sort((a, b) => {
      if (a.status === 'Identical' && b.status !== 'Identical') return 1;
      if (a.status !== 'Identical' && b.status === 'Identical') return -1;
      
      const sevA = severityWeight[a.severity] || 0;
      const sevB = severityWeight[b.severity] || 0;
      if (sevB !== sevA) return sevB - sevA;
      return a.key.localeCompare(b.key);
    });
    
    // KPI Calculations
    const modifiedCount = results.filter(r => r.status === 'Modified').length;
    const addedCount = results.filter(r => r.status === 'Added').length;
    const removedCount = results.filter(r => r.status === 'Removed').length;
    const totalCount = results.length;
    
    // Health Score Calculation (out of 100%)
    let score = 100;
    results.forEach(r => {
      if (r.status === 'Modified') {
        if (r.severity === 'High') score -= 10;
        else if (r.severity === 'Medium') score -= 5;
        else score -= 1;
      } else if (r.status === 'Removed') {
        if (r.severity === 'High') score -= 12;
        else if (r.severity === 'Medium') score -= 6;
        else score -= 2;
      } else if (r.status === 'Added') {
        if (r.severity === 'High') score -= 8;
        else if (r.severity === 'Medium') score -= 4;
        // Low severity added configurations carry no deduction penalty
      }
    });
    
    const finalScore = Math.max(0, Math.min(100, score));
    let finalRisk = 'Low';
    if (finalScore < 60) finalRisk = 'High';
    else if (finalScore < 90) finalRisk = 'Medium';
    
    setDriftData(results);
    setKpis({
      total: totalCount,
      modified: modifiedCount,
      added: addedCount,
      removed: removedCount
    });
    setHealthScore(finalScore);
    setRiskLevel(finalRisk);
    
    if (!isSilent) {
      setTimeout(() => {
        setIsAnalyzing(false);
        setIsAnalyzed(true);
        resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 750); // Small delay for ocean loading animation
    } else {
      setIsAnalyzed(true);
    }
  };

  const loadSampleData = () => {
    setDevInput(SAMPLE_DEV);
    setProdInput(SAMPLE_PROD);
    setDevError(null);
    setProdError(null);
    setIsAnalyzed(false);
    // Short timeout to let inputs resolve and trigger comparison run
    setTimeout(() => {
      compareRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // CSV Report Generator
  const handleExportCSV = () => {
    const headers = ['Configuration Key', 'Development Value', 'Production Value', 'Severity', 'Status'];
    const rows = driftData.map(item => [
      item.key,
      `"${item.devValue.replace(/"/g, '""')}"`,
      `"${item.prodValue.replace(/"/g, '""')}"`,
      item.severity,
      item.status
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'config_drift_report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF Report Generator (Generates and downloads PDF directly using jsPDF)
  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Header Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(2, 21, 38); // Deep Blue (#021526)
    doc.text("Config Drift Detector", 14, 22);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(110, 172, 218); // Aqua Blue
    doc.text("Infrastructure Configuration Drift & Security Audit Report", 14, 28);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 130, 22);
    
    // Separator line
    doc.setDrawColor(110, 172, 218);
    doc.setLineWidth(0.8);
    doc.line(14, 32, 196, 32);
    
    // 1. Executive Summary Block
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(3, 52, 110); // Navy Blue
    doc.text("1. Executive Summary", 14, 43);
    
    // Summary Cards container background
    doc.setFillColor(245, 248, 252);
    doc.roundedRect(14, 47, 182, 34, 3, 3, "F");
    
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text("Configuration Health Score:", 20, 55);
    doc.setFont("helvetica", "normal");
    doc.text(`${healthScore}%`, 70, 55);
    
    doc.setFont("helvetica", "bold");
    doc.text("Environment Risk Assessment:", 20, 62);
    doc.setFont("helvetica", "normal");
    doc.text(riskLevel.toUpperCase(), 70, 62);
    
    doc.setFont("helvetica", "bold");
    doc.text("Mapped Parameters Count:", 20, 69);
    doc.setFont("helvetica", "normal");
    doc.text(String(kpis.total), 70, 69);
    
    doc.setFont("helvetica", "bold");
    doc.text("Modified Keys (Value Drift):", 110, 55);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 130, 0); // Amber
    doc.text(String(kpis.modified), 158, 55);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text("Added Keys (New to Prod):", 110, 62);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(16, 124, 65); // Green
    doc.text(String(kpis.added), 158, 62);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text("Removed Keys (Missing Prod):", 110, 69);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(168, 0, 0); // Red
    doc.text(String(kpis.removed), 158, 69);
    
    // 2. Action Items
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(3, 52, 110);
    doc.text("2. Recommended Actions & Security Alerts", 14, 93);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    let yPos = 100;
    
    getRecommendations().forEach((rec) => {
      // Split text to wrap properly
      const textLines = doc.splitTextToSize(`• ${rec.text}`, 174);
      doc.text(textLines, 18, yPos);
      yPos += textLines.length * 4.5 + 1.5;
    });
    
    // 3. Configuration Drift Table
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(3, 52, 110);
    doc.text("3. Detailed Configuration Drift Audit", 14, yPos + 6);
    yPos += 12;
    
    // Table Headers
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(3, 52, 110); // Navy Blue Header
    doc.setTextColor(255, 255, 255);
    doc.rect(14, yPos, 182, 6, "F");
    doc.text("PARAMETER KEY", 17, yPos + 4);
    doc.text("DEVELOPMENT VALUE", 65, yPos + 4);
    doc.text("PRODUCTION VALUE", 115, yPos + 4);
    doc.text("STATUS", 165, yPos + 4);
    
    yPos += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    
    driftData.forEach((item, idx) => {
      // Page break check (standard letter page height is 297mm)
      if (yPos > 275) {
        doc.addPage();
        yPos = 20;
        
        // Redraw Header on new page
        doc.setFont("helvetica", "bold");
        doc.setFillColor(3, 52, 110);
        doc.setTextColor(255, 255, 255);
        doc.rect(14, yPos, 182, 6, "F");
        doc.text("PARAMETER KEY", 17, yPos + 4);
        doc.text("DEVELOPMENT VALUE", 65, yPos + 4);
        doc.text("PRODUCTION VALUE", 115, yPos + 4);
        doc.text("STATUS", 165, yPos + 4);
        
        yPos += 6;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
      }
      
      // Zebra striping backgrounds
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 253);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(14, yPos, 182, 6, "F");
      
      // Truncate cell outputs to prevent overlapping columns
      const cropKey = item.key.length > 26 ? item.key.substring(0, 23) + "..." : item.key;
      
      let devVal = item.devValue;
      if (item.status === 'Added') devVal = "(Not set)";
      const cropDev = devVal.length > 26 ? devVal.substring(0, 23) + "..." : devVal;
      
      let prodVal = item.prodValue;
      if (item.status === 'Removed') prodVal = "(Not set)";
      const cropProd = prodVal.length > 26 ? prodVal.substring(0, 23) + "..." : prodVal;
      
      // Write row cells
      doc.text(cropKey, 17, yPos + 4.2);
      doc.text(cropDev, 65, yPos + 4.2);
      doc.text(cropProd, 115, yPos + 4.2);
      
      // Color status text accordingly
      if (item.status === 'Modified') doc.setTextColor(180, 130, 0); // Amber
      else if (item.status === 'Added') doc.setTextColor(16, 124, 65); // Green
      else if (item.status === 'Removed') doc.setTextColor(168, 0, 0); // Red
      else doc.setTextColor(80, 100, 120); // Gray/Slate
      
      doc.text(item.status, 165, yPos + 4.2);
      doc.setTextColor(60, 60, 60); // reset color
      
      yPos += 6;
    });
    
    // Trigger direct file download
    doc.save("config_drift_report.pdf");
  };

  // Copy text boxes helper
  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'dev') {
      setCopiedDev(true);
      setTimeout(() => setCopiedDev(false), 2000);
    } else {
      setCopiedProd(true);
      setTimeout(() => setCopiedProd(false), 2000);
    }
  };

  // File Upload Handlers
  const handleFileUpload = (e, target) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (target === 'dev') {
        setDevInput(event.target.result);
        setDevError(null);
      } else {
        setProdInput(event.target.result);
        setProdError(null);
      }
    };
    reader.readAsText(file);
  };

  // Drag-and-drop file upload handlers
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, target) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (target === 'dev') {
        setDevInput(event.target.result);
        setDevError(null);
      } else {
        setProdInput(event.target.result);
        setProdError(null);
      }
    };
    reader.readAsText(file);
  };

  // Helper logic for rendering side-by-side formatted views with highlighting
  const getHighlightLineClass = (line, environment) => {
    // Look for key names inside double quotes in the line, e.g. "port": 8080
    const match = line.match(/"([^"]+)":/);
    if (!match) return 'px-4 hover:bg-white/5 py-0.5 transition-colors';
    
    const leafKey = match[1];
    
    // Find matching drift data
    const item = driftData.find(d => {
      const parts = d.key.split('.');
      const lastPart = parts[parts.length - 1];
      return lastPart === leafKey;
    });
    
    if (!item) return 'px-4 hover:bg-white/5 py-0.5 transition-colors';
    
    if (item.status === 'Modified') {
      return 'bg-yellow-500/15 border-l-4 border-yellow-500/80 px-3 hover:bg-yellow-500/25 py-0.5 text-yellow-100 transition-colors font-semibold';
    }
    if (item.status === 'Added') {
      return environment === 'prod'
        ? 'bg-emerald-500/15 border-l-4 border-emerald-500/80 px-3 hover:bg-emerald-500/25 py-0.5 text-emerald-100 transition-colors font-semibold'
        : 'opacity-40 px-4 py-0.5 hover:bg-white/5';
    }
    if (item.status === 'Removed') {
      return environment === 'dev'
        ? 'bg-rose-500/15 border-l-4 border-rose-500/80 px-3 hover:bg-rose-500/25 py-0.5 text-rose-100 transition-colors font-semibold'
        : 'opacity-40 px-4 py-0.5 hover:bg-white/5';
    }
    return 'px-4 hover:bg-white/5 py-0.5 transition-colors';
  };

  // Pretty print current text boxes
  const formatJSONInput = (target) => {
    const input = target === 'dev' ? devInput : prodInput;
    try {
      const parsed = JSON.parse(input);
      const formatted = JSON.stringify(parsed, null, 2);
      if (target === 'dev') setDevInput(formatted);
      else setProdInput(formatted);
    } catch (e) {
      // If YAML, don't pretty-print as JSON
    }
  };

  // Rule-based smart recommendations generator
  const getRecommendations = () => {
    const list = [];
    const devPort = driftData.find(d => d.key === 'port')?.rawDevValue;
    const prodPort = driftData.find(d => d.key === 'port')?.rawProdValue;
    const devDebug = driftData.find(d => d.key === 'debug' || d.key === 'debug_mode')?.rawDevValue;
    const prodDebug = driftData.find(d => d.key === 'debug' || d.key === 'debug_mode')?.rawProdValue;
    const devSSL = driftData.find(d => d.key === 'ssl_enabled')?.rawDevValue;
    const prodSSL = driftData.find(d => d.key === 'ssl_enabled')?.rawProdValue;
    const originsProd = driftData.find(d => d.key === 'allowed_origins')?.rawProdValue;

    if (devPort !== undefined && prodPort !== undefined && devPort !== prodPort) {
      list.push({
        type: 'warning',
        text: `Port number differs between environments (Dev: ${devPort}, Prod: ${prodPort}). Verify routing filters & proxy gateways.`
      });
    }
    
    if (devDebug === true) {
      list.push({
        type: 'warning',
        text: 'Debug mode enabled in Development. Ensure detailed logs and stacktraces are suppressed before publishing configurations.'
      });
    }

    if (prodDebug === true) {
      list.push({
        type: 'alert',
        text: '🚨 CRITICAL: Debug mode is active in Production! Disable debug logs immediately to protect system security.'
      });
    }

    if (prodSSL === true && devSSL === true) {
      list.push({
        type: 'success',
        text: 'SSL configuration is consistent. Transport layer encryption is active on both environments.'
      });
    } else if (prodSSL === false) {
      list.push({
        type: 'alert',
        text: '🚨 CRITICAL: SSL is disabled in Production! Transport layer encryption must be enabled for client traffic.'
      });
    }

    // Origin checks
    if (originsProd && Array.isArray(originsProd) && originsProd.includes('*')) {
      list.push({
        type: 'alert',
        text: '🚨 CRITICAL: CORS allows wildcards (*) in Production allowed_origins. Restrict allowed host lists.'
      });
    }

    // Fallback if no recommendations
    if (list.length === 0) {
      list.push({
        type: 'success',
        text: 'All checked security parameters are aligned and matching across environments.'
      });
    }

    return list;
  };

  // Compliance rules mapping
  const getComplianceRules = () => {
    const prodSSL = driftData.find(d => d.key === 'ssl_enabled')?.rawProdValue;
    const prodDebug = driftData.find(d => d.key === 'debug' || d.key === 'debug_mode')?.rawProdValue;
    const devPort = driftData.find(d => d.key === 'port')?.rawDevValue;
    const prodPort = driftData.find(d => d.key === 'port')?.rawProdValue;
    const originsProd = driftData.find(d => d.key === 'allowed_origins')?.rawProdValue;

    return [
      {
        name: 'SSL Enabled',
        desc: 'Ensures TLS/SSL is active in production settings',
        status: prodSSL === true
      },
      {
        name: 'Strong Security Settings',
        desc: 'Configures secure CORS allowed origin parameters (no wildcards)',
        status: originsProd ? !originsProd.includes('*') : true
      },
      {
        name: 'Debug Mode Disabled',
        desc: 'Ensures application debugging flags are off in production',
        status: prodDebug === false
      },
      {
        name: 'Production Port Mismatch',
        desc: 'Validates environment isolated routing configs',
        status: devPort !== prodPort // Passes (green check) when ports mismatch as isolation policy
      }
    ];
  };

  const filteredDrift = driftData.filter(item => {
    const matchesSearch = item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.devValue.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.prodValue.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterType === 'All') return matchesSearch;
    return item.status === filterType && matchesSearch;
  });

  return (
    <div className="relative min-h-screen pb-16 z-10 flex flex-col font-sans select-none">
      
      {/* Background Animated Water Bubbles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 no-print">
        {bubbles.map(b => (
          <div
            key={b.id}
            className="bubble"
            style={{
              left: b.left,
              width: b.size,
              height: b.size,
              animationDelay: b.delay,
              animationDuration: b.duration,
            }}
          />
        ))}
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full z-10 flex-grow">
        
        {/* Navigation Bar */}
        <nav className="flex items-center justify-between py-6 border-b border-[#6EACDA]/10 no-print">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#6EACDA] to-[#9CDCF5] flex items-center justify-center shadow-lg shadow-[#6EACDA]/20">
              <span className="text-[#021526] font-black text-xl font-heading">🌊</span>
            </div>
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-[#6EACDA] to-[#9CDCF5] bg-clip-text text-transparent font-heading">
              CDD
            </span>
          </div>
          <div className="flex items-center space-x-6 text-sm font-medium text-[#6EACDA]/80">
            <button 
              onClick={() => compareRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Analyze
            </button>
            <button 
              onClick={loadSampleData}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Load Sample
            </button>
            <span className="h-4 w-px bg-white/10" />
            <span className="text-xs bg-[#6EACDA]/10 px-2.5 py-1 rounded-full border border-[#6EACDA]/20 text-[#9CDCF5]">
              v1.0.0 (Demo)
            </span>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="py-16 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center z-10 no-print">
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-[#6EACDA]/10 border border-[#6EACDA]/20 text-[#9CDCF5] text-xs font-semibold uppercase tracking-wider animate-pulse-slow">
              <ShieldAlert className="w-4 h-4 text-[#9CDCF5]" />
              <span>Real-time Environment Alignment</span>
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black font-heading leading-tight tracking-tight text-white text-glow">
              Config Drift <br />
              <span className="text-[#6EACDA]">Detector</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-300 font-light max-w-xl mx-auto lg:mx-0">
              "Detect configuration drift between environments before it impacts production."
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
              <button
                onClick={() => compareRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-[#6EACDA] to-[#9CDCF5] text-[#021526] font-bold shadow-lg shadow-[#6EACDA]/25 hover:shadow-[#9CDCF5]/40 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <RefreshCw className="w-4 h-4 animate-spin-slow" />
                <span>Compare Configurations</span>
              </button>
              <button
                onClick={loadSampleData}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 hover:border-[#6EACDA]/35 transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <FileText className="w-4 h-4 text-[#6EACDA]" />
                <span>View Sample</span>
              </button>
            </div>
          </div>

          {/* Floating Underwater Server SVG Illustration */}
          <div className="lg:col-span-5 flex justify-center items-center relative h-72 md:h-96">
            <div className="absolute w-64 h-64 rounded-full bg-[#6EACDA]/5 filter blur-3xl animate-pulse" />
            <svg 
              viewBox="0 0 400 400" 
              className="w-full max-w-[340px] md:max-w-[380px] h-auto animate-float z-10"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Underwater Waves Lines */}
              <path d="M50,150 Q100,100 200,150 T350,150" fill="none" stroke="rgba(110,172,218,0.2)" strokeWidth="3" strokeDasharray="5,5" />
              <path d="M50,250 Q100,200 200,250 T350,250" fill="none" stroke="rgba(156,220,245,0.15)" strokeWidth="2" />
              
              {/* Glowing Jellyfish / Cloud Nodes */}
              {/* Cloud Node Left - Dev */}
              <g className="cursor-pointer">
                <circle cx="100" cy="180" r="45" fill="url(#devGrad)" className="filter drop-shadow-[0_0_15px_rgba(110,172,218,0.4)]" />
                <rect x="75" y="165" width="50" height="8" rx="2" fill="rgba(255,255,255,0.7)" />
                <rect x="75" y="178" width="50" height="8" rx="2" fill="rgba(255,255,255,0.7)" />
                <circle cx="85" cy="195" r="3" fill="#6EACDA" />
                <circle cx="100" cy="195" r="3" fill="#6EACDA" />
                <circle cx="115" cy="195" r="3" fill="#6EACDA" />
                <text x="100" y="150" textAnchor="middle" fill="#9CDCF5" fontSize="11" fontWeight="bold" fontFamily="Outfit">DEV ENV</text>
              </g>

              {/* Central Reef Core */}
              <g>
                <circle cx="200" cy="280" r="30" fill="none" stroke="#6EACDA" strokeWidth="2" strokeDasharray="4,8" className="animate-spin-slow" />
                <circle cx="200" cy="280" r="15" fill="rgba(156, 220, 245, 0.2)" stroke="#9CDCF5" strokeWidth="1" />
                <circle cx="200" cy="280" r="6" fill="#9CDCF5" className="animate-ping" />
                <path d="M200,250 L200,100" stroke="rgba(156,220,245,0.3)" strokeWidth="1.5" />
              </g>

              {/* Cloud Node Right - Prod */}
              <g className="cursor-pointer">
                <circle cx="300" cy="180" r="45" fill="url(#prodGrad)" className="filter drop-shadow-[0_0_15px_rgba(156,220,245,0.4)]" />
                <rect x="275" y="165" width="50" height="8" rx="2" fill="rgba(255,255,255,0.7)" />
                <rect x="275" y="178" width="50" height="8" rx="2" fill="rgba(255,255,255,0.7)" />
                <circle cx="285" cy="195" r="3" fill="#9CDCF5" />
                <circle cx="300" cy="195" r="3" fill="#9CDCF5" />
                <circle cx="315" cy="195" r="3" fill="#9CDCF5" className="animate-pulse" />
                <text x="300" y="150" textAnchor="middle" fill="#9CDCF5" fontSize="11" fontWeight="bold" fontFamily="Outfit">PROD ENV</text>
              </g>

              {/* Connecting Jellyfish Tentacles / Data Pipelines */}
              <path d="M145,180 C200,180 200,280 200,280" fill="none" stroke="#6EACDA" strokeWidth="3" strokeLinecap="round" className="opacity-70" />
              <path d="M255,180 C200,180 200,280 200,280" fill="none" stroke="#9CDCF5" strokeWidth="3" strokeLinecap="round" className="opacity-70" />

              {/* Flowing Data Nodes */}
              <circle cx="160" cy="182" r="4" fill="#9CDCF5" className="animate-pulse" />
              <circle cx="240" cy="182" r="4" fill="#9CDCF5" className="animate-pulse" />
              
              {/* Gradients */}
              <defs>
                <linearGradient id="devGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#03346E" />
                  <stop offset="100%" stopColor="#021526" />
                </linearGradient>
                <linearGradient id="prodGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6EACDA" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#03346E" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </section>

        {/* Dashboard Summary Section */}
        <section className="pb-16 grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          
          {/* Card 1: Total Keys */}
          <div className="glass-panel glass-panel-hover p-5 md:p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-[#6EACDA]/5 group-hover:bg-[#6EACDA]/10 transition-colors duration-300" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tracking-wide text-slate-300 uppercase">Total Keys</span>
              <div className="p-2 rounded-lg bg-[#6EACDA]/10 text-[#6EACDA]">
                <Database className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl md:text-4xl font-extrabold text-white font-heading tracking-tight">
                {isAnalyzed ? kpis.total : '—'}
              </span>
              <p className="text-xs text-[#6EACDA] mt-1 font-medium">Mapped parameters</p>
            </div>
          </div>

          {/* Card 2: Modified */}
          <div className="glass-panel glass-panel-hover p-5 md:p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-yellow-500/5 group-hover:bg-yellow-500/10 transition-colors duration-300" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tracking-wide text-slate-300 uppercase">Modified</span>
              <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl md:text-4xl font-extrabold text-yellow-400 font-heading tracking-tight">
                {isAnalyzed ? kpis.modified : '—'}
              </span>
              <p className="text-xs text-yellow-400/80 mt-1 font-medium">Key value mismatches</p>
            </div>
          </div>

          {/* Card 3: Added */}
          <div className="glass-panel glass-panel-hover p-5 md:p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors duration-300" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tracking-wide text-slate-300 uppercase">Added</span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <PlusCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl md:text-4xl font-extrabold text-emerald-400 font-heading tracking-tight">
                {isAnalyzed ? kpis.added : '—'}
              </span>
              <p className="text-xs text-emerald-400/80 mt-1 font-medium">Unique to Production</p>
            </div>
          </div>

          {/* Card 4: Removed */}
          <div className="glass-panel glass-panel-hover p-5 md:p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-rose-500/5 group-hover:bg-rose-500/10 transition-colors duration-300" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tracking-wide text-slate-300 uppercase">Removed</span>
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                <MinusCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl md:text-4xl font-extrabold text-rose-400 font-heading tracking-tight">
                {isAnalyzed ? kpis.removed : '—'}
              </span>
              <p className="text-xs text-rose-400/80 mt-1 font-medium">Missing from Production</p>
            </div>
          </div>

        </section>

        {/* Configuration Comparison Setup Block */}
        <section ref={compareRef} className="pb-16 scroll-mt-6 no-print">
          <div className="glass-panel p-6 md:p-8 rounded-3xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-[#6EACDA]/10 gap-4">
              <div>
                <h2 className="text-2xl font-bold font-heading text-white">Upload Configurations</h2>
                <p className="text-sm text-slate-300 mt-1">Provide configuration inputs as JSON or YAML files to trigger comparison analysis.</p>
              </div>
              
              {/* Tab Selector */}
              <div className="flex p-1 rounded-xl bg-[#021526]/50 border border-white/5 self-start">
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                    activeTab === 'upload' 
                      ? 'bg-gradient-to-r from-[#6EACDA] to-[#9CDCF5] text-[#021526]' 
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  File Upload
                </button>
                <button
                  onClick={() => setActiveTab('paste')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                    activeTab === 'paste' 
                      ? 'bg-gradient-to-r from-[#6EACDA] to-[#9CDCF5] text-[#021526]' 
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Edit / Paste Text
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-8">
              
              {/* Left Side: Development Configuration */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold uppercase tracking-wider text-[#9CDCF5] font-heading flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#6EACDA] inline-block" />
                    <span>Development Environment (Config A)</span>
                  </label>
                  {activeTab === 'paste' && (
                    <div className="flex items-center space-x-3 text-xs">
                      <button
                        onClick={() => formatJSONInput('dev')}
                        className="text-[#6EACDA] hover:text-white transition-colors cursor-pointer"
                        title="Format JSON"
                      >
                        Format
                      </button>
                      <button
                        onClick={() => copyToClipboard(devInput, 'dev')}
                        className="text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center space-x-1"
                      >
                        {copiedDev ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedDev ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {activeTab === 'upload' ? (
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'dev')}
                    className="h-64 rounded-2xl border-2 border-dashed border-[#6EACDA]/25 hover:border-[#6EACDA]/50 bg-[#021526]/30 flex flex-col items-center justify-center p-6 text-center transition-all group relative overflow-hidden"
                  >
                    <Upload className="w-12 h-12 text-[#6EACDA]/60 group-hover:text-[#6EACDA] group-hover:scale-110 transition-all mb-4" />
                    <span className="text-sm font-semibold text-white">Drag and drop file here</span>
                    <span className="text-xs text-slate-400 mt-1">Supports JSON or YAML (.json, .yaml, .yml)</span>
                    <label className="mt-4 px-4 py-2 rounded-xl bg-[#6EACDA]/10 border border-[#6EACDA]/30 text-[#9CDCF5] text-xs font-semibold hover:bg-[#6EACDA]/20 transition-all cursor-pointer">
                      Browse Files
                      <input 
                        type="file" 
                        accept=".json,.yaml,.yml"
                        onChange={(e) => handleFileUpload(e, 'dev')} 
                        className="hidden" 
                      />
                    </label>
                    {devInput && (
                      <div className="absolute bottom-3 left-3 right-3 py-1.5 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between">
                        <span className="truncate">Active Config Loaded (Size: {devInput.length} bytes)</span>
                        <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 ml-2" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <textarea
                      value={devInput}
                      onChange={(e) => {
                        setDevInput(e.target.value);
                        setDevError(null);
                      }}
                      className="w-full h-64 bg-[#021526]/50 border border-[#6EACDA]/20 rounded-2xl p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-[#6EACDA]/60 focus:ring-1 focus:ring-[#6EACDA]/60 resize-none"
                      placeholder="Paste Dev JSON/YAML here..."
                    />
                    {devError && (
                      <div className="absolute bottom-3 left-3 right-3 p-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-medium">
                        {devError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Side: Production Configuration */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold uppercase tracking-wider text-[#9CDCF5] font-heading flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#9CDCF5] inline-block" />
                    <span>Production Environment (Config B)</span>
                  </label>
                  {activeTab === 'paste' && (
                    <div className="flex items-center space-x-3 text-xs">
                      <button
                        onClick={() => formatJSONInput('prod')}
                        className="text-[#6EACDA] hover:text-white transition-colors cursor-pointer"
                        title="Format JSON"
                      >
                        Format
                      </button>
                      <button
                        onClick={() => copyToClipboard(prodInput, 'prod')}
                        className="text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center space-x-1"
                      >
                        {copiedProd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedProd ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {activeTab === 'upload' ? (
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'prod')}
                    className="h-64 rounded-2xl border-2 border-dashed border-[#6EACDA]/25 hover:border-[#6EACDA]/50 bg-[#021526]/30 flex flex-col items-center justify-center p-6 text-center transition-all group relative overflow-hidden"
                  >
                    <Upload className="w-12 h-12 text-[#6EACDA]/60 group-hover:text-[#6EACDA] group-hover:scale-110 transition-all mb-4" />
                    <span className="text-sm font-semibold text-white">Drag and drop file here</span>
                    <span className="text-xs text-slate-400 mt-1">Supports JSON or YAML (.json, .yaml, .yml)</span>
                    <label className="mt-4 px-4 py-2 rounded-xl bg-[#6EACDA]/10 border border-[#6EACDA]/30 text-[#9CDCF5] text-xs font-semibold hover:bg-[#6EACDA]/20 transition-all cursor-pointer">
                      Browse Files
                      <input 
                        type="file" 
                        accept=".json,.yaml,.yml"
                        onChange={(e) => handleFileUpload(e, 'prod')} 
                        className="hidden" 
                      />
                    </label>
                    {prodInput && (
                      <div className="absolute bottom-3 left-3 right-3 py-1.5 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between">
                        <span className="truncate">Active Config Loaded (Size: {prodInput.length} bytes)</span>
                        <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 ml-2" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <textarea
                      value={prodInput}
                      onChange={(e) => {
                        setProdInput(e.target.value);
                        setProdError(null);
                      }}
                      className="w-full h-64 bg-[#021526]/50 border border-[#6EACDA]/20 rounded-2xl p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-[#6EACDA]/60 focus:ring-1 focus:ring-[#6EACDA]/60 resize-none"
                      placeholder="Paste Prod JSON/YAML here..."
                    />
                    {prodError && (
                      <div className="absolute bottom-3 left-3 right-3 p-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-medium">
                        {prodError}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Analyze Trigger */}
            <div className="mt-8 flex flex-col items-center justify-center">
              <button
                onClick={() => handleAnalyze(false)}
                disabled={isAnalyzing}
                className="px-12 py-4 rounded-2xl bg-gradient-to-r from-[#6EACDA] via-[#9CDCF5] to-[#6EACDA] bg-[length:200%_auto] hover:bg-right text-[#021526] font-extrabold text-lg shadow-xl shadow-[#6EACDA]/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer flex items-center space-x-3"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Analyzing Configs...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    <span>Analyze Drift</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Results Block */}
        {isAnalyzed && (
          <div ref={resultsRef} className="space-y-10 scroll-mt-6">
            
            {/* Step 2 Header & Comparison Results Table */}
            <section className="glass-panel p-6 md:p-8 rounded-3xl relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-[#6EACDA]/10 gap-4">
                <div>
                  <h2 className="text-2xl font-bold font-heading text-white">Comparison Results</h2>
                  <p className="text-sm text-slate-300 mt-1">Detailed evaluation of differences found across configuration nodes.</p>
                </div>
                
                {/* Search box */}
                <div className="relative w-full md:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search keys or values..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[#021526]/50 border border-[#6EACDA]/25 rounded-xl text-sm text-white focus:outline-none focus:border-[#6EACDA]/60 placeholder-slate-400"
                  />
                </div>
              </div>

              {/* Filtering Controls */}
              <div className="flex flex-wrap gap-2 py-4 overflow-x-auto">
                {['All', 'Modified', 'Added', 'Removed', 'Identical'].map((type) => {
                  const colors = {
                    All: 'hover:bg-white/10 text-white border-white/10',
                    Modified: 'hover:bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
                    Added: 'hover:bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                    Removed: 'hover:bg-rose-500/10 text-rose-400 border-rose-500/20',
                    Identical: 'hover:bg-sky-500/10 text-sky-400 border-sky-500/20',
                  };
                  const isActive = filterType === type;
                  
                  return (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-gradient-to-r from-[#6EACDA] to-[#9CDCF5] text-[#021526] border-transparent font-bold'
                          : `bg-[#021526]/30 ${colors[type]}`
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>

              {/* Results Table */}
              <div className="overflow-x-auto rounded-2xl border border-[#6EACDA]/10">
                <table className="min-w-full divide-y divide-[#6EACDA]/10 text-left">
                  <thead className="bg-[#021526]/40 text-xs font-bold text-[#6EACDA] uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Configuration Key</th>
                      <th className="px-6 py-4">Development Value</th>
                      <th className="px-6 py-4">Production Value</th>
                      <th className="px-6 py-4 text-center">Severity</th>
                      <th className="px-6 py-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#6EACDA]/5 bg-transparent text-sm">
                    {filteredDrift.length > 0 ? (
                      filteredDrift.map((item, idx) => {
                        const statusColors = {
                          Modified: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
                          Added: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                          Removed: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
                          Identical: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
                        };

                        const severityColors = {
                          High: 'text-rose-400 bg-rose-500/10 border-rose-500/20 font-bold',
                          Medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
                          Low: 'text-slate-300 bg-white/5 border-white/10',
                        };

                        return (
                          <tr key={idx} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4 font-mono text-xs text-white max-w-xs truncate" title={item.key}>
                              {item.key}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-slate-300 max-w-xs truncate" title={item.devValue}>
                              {item.status === 'Added' ? <span className="opacity-30 italic">Not set</span> : item.devValue}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-slate-300 max-w-xs truncate" title={item.prodValue}>
                              {item.status === 'Removed' ? <span className="opacity-30 italic">Not set</span> : item.prodValue}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${severityColors[item.severity] || ''}`}>
                                {item.severity}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColors[item.status] || ''}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                <span>{item.status}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                          <Info className="w-8 h-8 mx-auto text-slate-500 mb-2" />
                          <p>No matching configuration drifts found.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Side-by-Side Diff Viewer */}
            <section className="glass-panel p-6 md:p-8 rounded-3xl relative overflow-hidden">
              <h2 className="text-2xl font-bold font-heading text-white pb-6 border-b border-[#6EACDA]/10">
                Configuration Difference Viewer
              </h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
                
                {/* Dev Code Viewer */}
                <div className="rounded-2xl border border-white/10 bg-[#021526]/60 overflow-hidden flex flex-col">
                  <div className="bg-[#021526]/80 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs font-bold text-[#6EACDA] uppercase tracking-wider flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-[#6EACDA]" />
                      <span>Development Code</span>
                    </span>
                    <span className="text-[10px] bg-white/5 text-slate-400 px-2 py-0.5 rounded uppercase">JSON View</span>
                  </div>
                  <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed select-text max-h-80 overflow-y-auto">
                    <code>
                      {JSON.stringify(parseConfig(devInput).data, null, 2)
                        .split('\n')
                        .map((line, idx) => (
                          <div 
                            key={idx} 
                            className={getHighlightLineClass(line, 'dev')}
                          >
                            <span className="inline-block w-8 opacity-25 select-none text-right pr-3">{idx + 1}</span>
                            {line}
                          </div>
                        ))}
                    </code>
                  </pre>
                </div>

                {/* Prod Code Viewer */}
                <div className="rounded-2xl border border-white/10 bg-[#021526]/60 overflow-hidden flex flex-col">
                  <div className="bg-[#021526]/80 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs font-bold text-[#9CDCF5] uppercase tracking-wider flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-[#9CDCF5]" />
                      <span>Production Code</span>
                    </span>
                    <span className="text-[10px] bg-white/5 text-slate-400 px-2 py-0.5 rounded uppercase">JSON View</span>
                  </div>
                  <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed select-text max-h-80 overflow-y-auto">
                    <code>
                      {JSON.stringify(parseConfig(prodInput).data, null, 2)
                        .split('\n')
                        .map((line, idx) => (
                          <div 
                            key={idx} 
                            className={getHighlightLineClass(line, 'prod')}
                          >
                            <span className="inline-block w-8 opacity-25 select-none text-right pr-3">{idx + 1}</span>
                            {line}
                          </div>
                        ))}
                    </code>
                  </pre>
                </div>

              </div>
              
              <div className="flex items-center space-x-6 mt-4 justify-end text-xs text-slate-400">
                <div className="flex items-center space-x-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-rose-500/15 border border-rose-500/30" />
                  <span>Removed</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-yellow-500/15 border border-yellow-500/30" />
                  <span>Modified</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-emerald-500/15 border border-emerald-500/30" />
                  <span>Added</span>
                </div>
              </div>
            </section>

            {/* Risk, Recommendations & Compliance Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Risk Analysis Section */}
              <div className="glass-panel p-6 md:p-8 rounded-3xl relative overflow-hidden flex flex-col justify-between">
                <div>
                  <h2 className="text-xl font-bold font-heading text-white">Configuration Health</h2>
                  <p className="text-xs text-slate-400 mt-1">Aggregated scoring checking alignment constraints.</p>
                </div>
                
                {/* Circular Progress Gauge */}
                <div className="flex items-center justify-center py-6">
                  <div className="relative w-44 h-44 flex items-center justify-center">
                    
                    {/* SVG circular track */}
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="88"
                        cy="88"
                        r="74"
                        fill="transparent"
                        stroke="rgba(110, 172, 218, 0.1)"
                        strokeWidth="12"
                      />
                      <circle
                        cx="88"
                        cy="88"
                        r="74"
                        fill="transparent"
                        stroke="url(#healthGrad)"
                        strokeWidth="12"
                        strokeDasharray={2 * Math.PI * 74}
                        strokeDashoffset={2 * Math.PI * 74 * (1 - healthScore / 100)}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                      <defs>
                        <linearGradient id="healthGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#6EACDA" />
                          <stop offset="100%" stopColor="#9CDCF5" />
                        </linearGradient>
                      </defs>
                    </svg>
                    
                    {/* Centered Score */}
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-4xl font-extrabold text-white font-heading tracking-tighter">
                        {healthScore}%
                      </span>
                      <span className={`text-xs uppercase font-extrabold tracking-widest mt-1 ${
                        riskLevel === 'Low' ? 'text-sky-400' : riskLevel === 'Medium' ? 'text-yellow-400' : 'text-rose-400'
                      }`}>
                        {riskLevel} Risk
                      </span>
                    </div>

                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-300">
                    <span>Alignment Health Score</span>
                    <span>{healthScore}/100</span>
                  </div>
                  <div className="w-full h-2 bg-[#021526]/50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#6EACDA] to-[#9CDCF5] rounded-full transition-all duration-1000"
                      style={{ width: `${healthScore}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Smart Recommendations Section */}
              <div className="glass-panel p-6 md:p-8 rounded-3xl relative overflow-hidden flex flex-col">
                <h2 className="text-xl font-bold font-heading text-white mb-4">Recommended Actions</h2>
                <div className="space-y-3 flex-grow overflow-y-auto max-h-72 pr-2">
                  {getRecommendations().map((rec, idx) => {
                    const bgColors = {
                      warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-100',
                      alert: 'bg-rose-500/10 border-rose-500/20 text-rose-100',
                      success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100',
                    };
                    
                    return (
                      <div 
                        key={idx}
                        className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start space-x-2.5 ${bgColors[rec.type]}`}
                      >
                        {rec.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />}
                        {rec.type === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />}
                        {rec.type === 'alert' && <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />}
                        <span>{rec.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Compliance Checker Section */}
              <div className="glass-panel p-6 md:p-8 rounded-3xl relative overflow-hidden flex flex-col">
                <h2 className="text-xl font-bold font-heading text-white mb-4">Compliance Validation</h2>
                <div className="space-y-3 flex-grow justify-between">
                  {getComplianceRules().map((rule, idx) => (
                    <div 
                      key={idx} 
                      className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                        rule.status 
                          ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-300' 
                          : 'bg-rose-500/5 border-rose-500/15 text-rose-300'
                      }`}
                    >
                      <div className="flex flex-col pr-4">
                        <span className="text-xs font-bold font-heading">{rule.name}</span>
                        <span className="text-[10px] opacity-75 mt-0.5">{rule.desc}</span>
                      </div>
                      <div className="flex-shrink-0">
                        {rule.status ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 border border-emerald-500/30">
                            <Check className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-rose-500/15 flex items-center justify-center text-rose-400 border border-rose-500/30">
                            <span className="font-bold text-xs">×</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Export Section */}
            <section className="glass-panel p-6 md:p-8 rounded-3xl relative overflow-hidden no-print">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div>
                  <h2 className="text-xl font-bold font-heading text-white">Generate Report</h2>
                  <p className="text-sm text-slate-300 mt-1">Export environment audit logs to PDF format or download structured dataset as a CSV.</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                  <button
                    onClick={handleExportPDF}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#6EACDA]/30 text-white font-semibold text-sm transition-all cursor-pointer flex items-center justify-center space-x-2"
                  >
                    <FileCheck2 className="w-4 h-4 text-[#6EACDA]" />
                    <span>Export PDF</span>
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-[#6EACDA] to-[#9CDCF5] text-[#021526] font-bold text-sm shadow-lg shadow-[#6EACDA]/10 hover:shadow-[#6EACDA]/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download CSV</span>
                  </button>
                </div>
              </div>
            </section>

          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="mt-20 border-t border-[#6EACDA]/10 pt-8 text-center text-slate-400 text-xs px-4 w-full z-10 no-print">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-left">
            <h3 className="font-bold font-heading text-[#9CDCF5] text-sm">Config Drift Detector</h3>
            <p className="mt-1 text-slate-400">Infrastructure Monitoring & Configuration Analysis Platform</p>
          </div>
          <div className="text-slate-500 font-medium">
            &copy; {new Date().getFullYear()} CDD Admin. Developed for college project presentation.
          </div>
        </div>
      </footer>

    </div>
  );
}

export default App;
