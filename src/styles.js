// ============================================================
// WikiM - Module: Styles CSS
// ============================================================
(function(W, WikiM) {
    'use strict';

    const addStyle = typeof GM_addStyle === 'function' ? GM_addStyle : function(css) {
        const style = document.createElement('style');
        style.id = 'wm-custom-styles';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    };

    addStyle(`
        /* ===== Boutons d'action sur cartes (uniquement /pulls) ===== */
        .wm-actions-wrapper { position: absolute; top: 10px; right: 10px; z-index: 50; display: flex; flex-direction: column; gap: 8px; }
        .wm-action-btn { color: white; border: none; border-radius: 8px; padding: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); user-select: none; }
        .wm-action-btn svg { width: 18px; height: 18px; }
        .wm-btn-discard { background-color: rgba(220, 38, 38, 0.9); } .wm-btn-discard:hover:not(:disabled) { background-color: rgba(239, 68, 68, 1); transform: scale(1.1); }
        .wm-btn-auction { background-color: rgba(16, 185, 129, 0.9); } .wm-btn-auction:hover:not(:disabled) { background-color: rgba(5, 150, 105, 1); transform: scale(1.1); }
        .wm-btn-bulk { background-color: rgba(59, 130, 246, 0.9); } .wm-btn-bulk:hover:not(:disabled) { background-color: rgba(37, 99, 235, 1); transform: scale(1.1); }
        .wm-btn-bulk-active { background-color: rgba(16, 185, 129, 0.95) !important; } .wm-btn-bulk-active:hover:not(:disabled) { background-color: rgba(5, 150, 105, 1) !important; transform: scale(1.1); }
        .wm-action-btn:disabled { background-color: #4b5563 !important; cursor: not-allowed !important; transform: none !important; opacity: 0.5; }
        .wm-processed-card { filter: grayscale(100%) brightness(0.7) opacity(0.6) !important; pointer-events: none !important; transition: all 0.2s ease !important; }

        /* ===== Prix en cache ===== */
        .wm-price-panel { position: absolute; bottom: 12px; left: 12px; z-index: 40; background-color: rgba(15, 23, 42, 0.95); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 6px 10px; font-size: 12px; font-family: monospace; box-shadow: 0 4px 6px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 4px; pointer-events: none; min-width: 80px; }
        .wm-price-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px; }
        .wm-price-row:last-child { border-bottom: none; padding-bottom: 0; }
        .wm-rarity-label { font-weight: bold; } .wm-val { color: var(--color-accent, #fbbf24); font-weight: bold; }
        .wm-r-L { color: #ef4444; } .wm-r-UR { color: #f97316; } .wm-r-SR { color: #a855f7; } .wm-r-R { color: #3b82f6; } .wm-r-PC { color: #10b981; } .wm-r-C { color: #9ca3af; }
        .wm-empty-sales { color: #9ca3af; font-size: 10px; justify-content: center; font-style: italic; }
        .wm-loading-badge { color: #fbbf24; font-size: 10px; justify-content: center; font-style: italic; }

        /* ===== Sniper (nouvelle version) ===== */
        .wm-sniper-row {
            display: flex; gap: 8px;
        }
        .wm-sniper-row .wm-sniper-field { flex: 1; }

        .wm-sniper-panel {
            margin: 0;
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 12px;
            padding: 14px 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #e5e7eb;
            box-shadow: 0 6px 24px rgba(0,0,0,0.4);
        }
        .wm-sniper-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .wm-sniper-title { font-size: 14px; font-weight: 700; color: #a5b4fc; }
        .wm-sniper-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #cbd5e1; cursor: pointer; }
        .wm-sniper-toggle input { cursor: pointer; width: 16px; height: 16px; accent-color: #6366f1; }
        .wm-sniper-body { display: flex; flex-direction: column; gap: 10px; }
        .wm-sniper-field { display: flex; flex-direction: column; gap: 4px; }
        .wm-sniper-field label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        .wm-sniper-field input { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 6px; padding: 8px 10px; color: white; font-size: 13px; outline: none; }
        .wm-sniper-field input:focus { border-color: #6366f1; }
        .wm-sniper-status {
            display: flex; align-items: center; gap: 8px;
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 12px;
            margin-top: 4px;
        }
        .wm-sniper-status-dot { width: 10px; height: 10px; border-radius: 50%; background: #6b7280; flex-shrink: 0; }
        .wm-sniper-meta { font-size: 10.5px; color: #64748b; font-family: monospace; }

        /* ===== Enchères suivies : mini sniper ===== */
        .wm-tracked-sniper {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 8px;
            background: rgba(15, 23, 42, 0.5);
            border-radius: 6px;
            font-size: 11px;
            margin-top: 2px;
        }
        .wm-sniper-mini-toggle {
            display: flex; align-items: center; gap: 4px;
            cursor: pointer; color: #cbd5e1; font-size: 11px;
        }
        .wm-sniper-mini-toggle input { cursor: pointer; width: 14px; height: 14px; accent-color: #6366f1; }
        .wm-sniper-mini-info { color: #64748b; font-family: monospace; font-size: 10px; flex: 1; }
        .wm-sniper-mini-edit {
            background: rgba(79, 70, 229, 0.4) !important;
            padding: 3px 8px !important;
            font-size: 12px !important;
        }
        .wm-sniper-mini-edit:hover { background: rgba(79, 70, 229, 0.7) !important; }

        /* ===== Bouton engrenage (drag & drop) ===== */
        #wm-floating-toggle {
            position: fixed; bottom: 20px; left: 20px; z-index: 99999;
            width: 52px; height: 52px; border-radius: 50%;
            background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
            color: white; border: 2px solid rgba(255,255,255,0.15);
            display: flex; align-items: center; justify-content: center;
            cursor: grab; user-select: none;
            box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
            transition: transform 0.15s, box-shadow 0.15s;
        }
        #wm-floating-toggle:hover { transform: scale(1.08); box-shadow: 0 8px 26px rgba(79, 70, 229, 0.55); }
        #wm-floating-toggle:active, #wm-floating-toggle.wm-dragging { cursor: grabbing; transform: scale(1.05); }
        #wm-floating-toggle svg { width: 26px; height: 26px; transition: transform 0.4s; }
        #wm-floating-toggle.wm-menu-open svg { transform: rotate(90deg); }
        #wm-floating-toggle .wm-badge {
            position: absolute; top: -4px; right: -4px;
            min-width: 20px; height: 20px; padding: 0 5px;
            background: #ef4444; color: white; border-radius: 999px;
            font-size: 11px; font-weight: bold; display: none;
            align-items: center; justify-content: center;
            border: 2px solid #0f172a;
        }
        #wm-floating-toggle .wm-badge.show { display: flex; }

        /* ===== Panneau de contrôle ===== */
        #wm-control-panel {
            position: fixed; z-index: 99999;
            width: 380px; max-height: 640px;
            background: rgba(15, 23, 42, 0.98);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 14px;
            box-shadow: 0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset;
            display: none; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #e5e7eb; overflow: hidden;
            backdrop-filter: blur(12px);
        }
        #wm-control-panel.show { display: flex; }

        .wm-panel-header {
            padding: 12px 16px;
            background: linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(99, 102, 241, 0.08) 100%);
            border-bottom: 1px solid rgba(255,255,255,0.08);
            display: flex; justify-content: space-between; align-items: center;
        }
        .wm-panel-header-title {
            font-weight: 700; font-size: 14px; letter-spacing: 0.02em;
            background: linear-gradient(135deg, #a5b4fc 0%, #c7d2fe 100%);
            -webkit-background-clip: text; background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .wm-panel-close { background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 18px; padding: 4px; border-radius: 6px; }
        .wm-panel-close:hover { color: white; background: rgba(255,255,255,0.08); }

        .wm-tabs {
            display: flex; gap: 2px; padding: 8px 6px 0;
            background: rgba(30, 41, 59, 0.5);
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .wm-tab {
            flex: 1; padding: 10px 4px; background: none; border: none;
            color: #94a3b8; font-size: 11px; font-weight: 600;
            cursor: pointer; border-radius: 8px 8px 0 0;
            display: flex; flex-direction: column; align-items: center; gap: 2px;
            transition: all 0.15s; position: relative;
        }
        .wm-tab:hover { color: #e5e7eb; background: rgba(255,255,255,0.04); }
        .wm-tab.active { color: #a5b4fc; background: rgba(79, 70, 229, 0.12); }
        .wm-tab.active::after {
            content: ''; position: absolute; bottom: -1px; left: 12%; right: 12%;
            height: 2px; background: linear-gradient(90deg, #6366f1, #a5b4fc);
            border-radius: 2px;
        }
        .wm-tab-icon { font-size: 16px; }
        .wm-tab .wm-tab-badge {
            position: absolute; top: 4px; right: 6px;
            min-width: 16px; height: 16px; padding: 0 4px;
            background: #ef4444; color: white; border-radius: 999px;
            font-size: 9px; font-weight: bold; display: none;
            align-items: center; justify-content: center;
        }
        .wm-tab .wm-tab-badge.show { display: flex; }

        .wm-tab-content {
            padding: 14px;
            overflow-y: auto; flex: 1;
            display: flex; flex-direction: column; gap: 14px;
        }
        .wm-tab-content.hidden { display: none; }

        .wm-section-title {
            font-size: 10px; font-weight: 700; color: #64748b;
            text-transform: uppercase; letter-spacing: 0.08em;
            margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
        }
        .wm-section-title::after {
            content: ''; flex: 1; height: 1px;
            background: linear-gradient(90deg, rgba(100,116,139,0.3), transparent);
        }

        .wm-panel-input {
            flex: 1; background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px; padding: 9px 12px;
            color: white; font-size: 12px; outline: none;
            transition: border-color 0.15s;
        }
        .wm-panel-input:focus { border-color: #6366f1; background: rgba(30, 41, 59, 0.9); }
        .wm-input-group { display: flex; gap: 6px; }

        .wm-panel-btn {
            background: linear-gradient(135deg, #4f46e5, #6366f1);
            color: white; border: none; border-radius: 8px;
            padding: 9px 14px; font-size: 12px; font-weight: 600;
            cursor: pointer; transition: all 0.15s;
            box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
        }
        .wm-panel-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
        .wm-panel-btn:active { transform: translateY(0); }
        .wm-panel-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .wm-panel-btn.danger { background: linear-gradient(135deg, #dc2626, #ef4444); box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3); }
        .wm-panel-btn.ghost { background: rgba(71, 85, 105, 0.5); box-shadow: none; }
        .wm-panel-btn.ghost:hover { background: rgba(71, 85, 105, 0.8); }

        #wm-log-box {
            background: rgba(2, 6, 23, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.1);
            border-radius: 8px; padding: 10px;
            font-family: 'SF Mono', Consolas, monospace; font-size: 10.5px;
            overflow-y: auto; max-height: 140px; color: #7dd3fc;
            display: flex; flex-direction: column; gap: 3px;
        }
        .wm-log-item { padding: 2px 0; word-break: break-all; opacity: 0.85; }
        .wm-log-item:last-child { opacity: 1; color: #38bdf8; }

        .wm-ping-box {
            display: flex; justify-content: space-between; align-items: center;
            background: rgba(30, 41, 59, 0.6);
            padding: 10px 12px; border-radius: 8px;
            font-size: 12px; font-weight: 600;
            border: 1px solid rgba(148, 163, 184, 0.1);
        }

        #wm-bulk-list-container {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px; padding: 8px; font-size: 11px;
            max-height: 120px; overflow-y: auto; margin-bottom: 8px;
        }
        .wm-bulk-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .wm-bulk-item:last-child { border-bottom: none; }
        .wm-bulk-empty { color: #64748b; font-style: italic; text-align: center; padding: 8px; }

        #wm-tracked-list {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px; padding: 8px; font-size: 12px;
            max-height: 300px; overflow-y: auto;
        }
        .wm-tracked-item {
            padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,0.04);
            display: flex; flex-direction: column; gap: 5px;
        }
        .wm-tracked-item:last-child { border-bottom: none; }
        .wm-tracked-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .wm-tracked-title { font-weight: 600; color: #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; font-size: 12px; }
        .wm-tracked-timer { font-family: monospace; font-weight: bold; color: #fbbf24; font-size: 11px; }
        .wm-tracked-timer.urgent { color: #ef4444; animation: wmPulse 1s infinite; }
        .wm-tracked-info { font-size: 10px; color: #94a3b8; display: flex; gap: 10px; }
        .wm-tracked-actions { display: flex; gap: 6px; }
        .wm-tracked-btn {
            background: rgba(51, 65, 85, 0.7); color: #e5e7eb;
            border: none; border-radius: 6px; padding: 4px 10px;
            font-size: 10.5px; cursor: pointer; font-weight: 600;
            transition: all 0.15s;
        }
        .wm-tracked-btn:hover { background: rgba(71, 85, 105, 0.9); }
        .wm-tracked-btn.danger { background: rgba(127, 29, 29, 0.7); }
        .wm-tracked-btn.danger:hover { background: rgba(153, 27, 27, 0.9); }
        .wm-tracked-empty { color: #64748b; font-style: italic; text-align: center; padding: 16px; }
        @keyframes wmPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        .wm-balance-card {
            background: linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(99, 102, 241, 0.08) 100%);
            border: 1px solid rgba(99, 102, 241, 0.25);
            border-radius: 12px; padding: 16px;
            display: flex; flex-direction: column; gap: 12px;
        }
        .wm-balance-current { display: flex; align-items: baseline; gap: 6px; justify-content: center; }
        .wm-balance-icon { font-size: 24px; }
        .wm-balance-value { font-size: 32px; font-weight: 800; color: #fbbf24; font-family: monospace; line-height: 1; }
        .wm-balance-unit { font-size: 14px; font-weight: 600; color: #cbd5e1; }
        .wm-balance-deltas { display: flex; gap: 8px; justify-content: center; }
        .wm-balance-delta {
            display: flex; flex-direction: column; align-items: center;
            padding: 6px 14px; border-radius: 8px;
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.1);
            min-width: 80px;
        }
        .wm-balance-delta-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
        .wm-balance-delta-value { font-size: 15px; font-weight: 700; font-family: monospace; }
        .wm-balance-delta.up .wm-balance-delta-value { color: #10b981; }
        .wm-balance-delta.down .wm-balance-delta-value { color: #ef4444; }
        .wm-balance-delta.flat .wm-balance-delta-value { color: #94a3b8; }
        .wm-balance-chart {
            background: rgba(30, 41, 59, 0.5);
            border: 1px solid rgba(148, 163, 184, 0.1);
            border-radius: 10px; padding: 8px 4px;
            overflow: hidden;
        }
        .wm-balance-list {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px; padding: 6px;
            max-height: 200px; overflow-y: auto;
        }
        .wm-balance-entry {
            display: grid; grid-template-columns: 1fr auto auto;
            gap: 10px; align-items: center;
            padding: 6px 8px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            font-size: 11px;
        }
        .wm-balance-entry:last-child { border-bottom: none; }
        .wm-balance-entry-date { color: #94a3b8; font-family: monospace; }
        .wm-balance-entry-delta { font-weight: 700; font-family: monospace; }
        .wm-balance-entry-delta.up { color: #10b981; }
        .wm-balance-entry-delta.down { color: #ef4444; }
        .wm-balance-entry-balance { color: #fbbf24; font-family: monospace; font-weight: 600; }

        .wm-pref-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: 7px 0; font-size: 12px; color: #cbd5e1;
            border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .wm-pref-row:last-child { border-bottom: none; }
        .wm-pref-row label { cursor: pointer; user-select: none; flex: 1; }
        .wm-pref-row input[type="checkbox"] { cursor: pointer; width: 16px; height: 16px; accent-color: #6366f1; }
        .wm-pref-row input[type="number"] {
            width: 64px; background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 6px; padding: 5px 8px;
            color: white; font-size: 11px; text-align: center;
        }

        /* ===== Règles d'auto-tagging ===== */
        .wm-rule-card {
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 10px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .wm-rule-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
        }
        .wm-rule-toggle {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: #cbd5e1;
            cursor: pointer;
            font-weight: 700;
        }
        .wm-rule-toggle input { accent-color: #6366f1; cursor: pointer; }
        .wm-rule-del {
            background: rgba(127, 29, 29, 0.7);
            border: none;
            border-radius: 6px;
            color: white;
            padding: 3px 8px;
            cursor: pointer;
            font-size: 11px;
        }
        .wm-rule-tag-row {
            display: flex;
            gap: 6px;
            align-items: center;
        }
        .wm-rule-tag-label {
            font-size: 10px;
            color: #94a3b8;
            font-weight: 700;
        }
        .wm-rule-conditions {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .wm-cond-row {
            display: grid;
            grid-template-columns: 1.4fr 0.9fr 1.2fr auto;
            gap: 4px;
            align-items: center;
        }
        .wm-cond-field,
        .wm-cond-op,
        .wm-cond-input {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 6px;
            padding: 6px;
            color: white;
            font-size: 11px;
            outline: none;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
        }
        .wm-cond-field:focus,
        .wm-cond-op:focus,
        .wm-cond-input:focus {
            border-color: #6366f1;
        }
        .wm-cond-del {
            background: rgba(127, 29, 29, 0.7);
            border: none;
            border-radius: 6px;
            color: white;
            width: 24px;
            height: 24px;
            cursor: pointer;
            font-size: 12px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .wm-rule-add-cond {
            background: rgba(51, 65, 85, 0.7);
            border: none;
            border-radius: 6px;
            color: #cbd5e1;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 10px;
            font-weight: 600;
            align-self: flex-start;
        }
        .wm-rule-add-cond:hover {
            background: rgba(71, 85, 105, 0.9);
        }

        #wm-track-btn {
            position: fixed; top: 80px; right: 20px; z-index: 9999;
            background: linear-gradient(135deg, #4f46e5, #6366f1);
            color: white; border: none; border-radius: 10px;
            padding: 10px 14px; font-size: 12px; font-weight: 700;
            cursor: pointer; display: flex; align-items: center; gap: 6px;
            box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
            transition: all 0.15s;
        }
        #wm-track-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(79, 70, 229, 0.55); }
        #wm-track-btn.tracked { background: linear-gradient(135deg, #dc2626, #ef4444); box-shadow: 0 6px 20px rgba(220, 38, 38, 0.4); }
        #wm-track-btn.tracked:hover { box-shadow: 0 8px 24px rgba(220, 38, 38, 0.55); }

        #wm-track-modal-overlay {
            position: fixed; inset: 0; z-index: 100000;
            background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
            animation: wmFadeIn 0.15s ease-out;
        }
        @keyframes wmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        #wm-track-modal {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 14px; padding: 22px; max-width: 420px; width: 90%;
            color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            box-shadow: 0 24px 48px rgba(0,0,0,0.7);
            animation: wmSlideUp 0.2s ease-out;
        }
        @keyframes wmSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        #wm-track-modal h3 { margin: 0 0 6px 0; font-size: 17px; font-weight: 700; }
        #wm-track-modal .wm-subtitle { color: #94a3b8; font-size: 12px; margin-bottom: 18px; }
        #wm-track-modal .wm-modal-label {
            display: block; font-size: 11px; font-weight: 600;
            color: #cbd5e1; margin-bottom: 6px;
            text-transform: uppercase; letter-spacing: 0.05em;
        }
        #wm-track-modal input[type="number"] {
            width: 100%; background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px; padding: 10px; color: white;
            font-size: 15px; margin-bottom: 16px; outline: none;
        }
        #wm-track-modal input[type="number"]:focus { border-color: #6366f1; }
        #wm-track-modal .wm-checkbox-row {
            display: flex; align-items: center; gap: 10px;
            padding: 8px 0; font-size: 13px; color: #cbd5e1;
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        #wm-track-modal .wm-checkbox-row:last-of-type { border-bottom: none; }
        #wm-track-modal .wm-checkbox-row input { width: 16px; height: 16px; cursor: pointer; accent-color: #6366f1; }
        #wm-track-modal .wm-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
        #wm-track-modal .wm-modal-btn {
            padding: 10px 18px; border-radius: 8px; border: none;
            font-size: 13px; font-weight: 700; cursor: pointer;
            transition: all 0.15s;
        }
        #wm-track-modal .wm-modal-btn.cancel { background: rgba(51, 65, 85, 0.7); color: #cbd5e1; }
        #wm-track-modal .wm-modal-btn.cancel:hover { background: rgba(71, 85, 105, 0.9); }
        #wm-track-modal .wm-modal-btn.confirm {
            background: linear-gradient(135deg, #4f46e5, #6366f1); color: white;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
        }
        #wm-track-modal .wm-modal-btn.confirm:hover { filter: brightness(1.15); }



        #wm-toast-container {
            position: fixed; bottom: 20px; right: 20px; z-index: 99998;
            display: flex; flex-direction: column-reverse; gap: 10px;
            max-width: 340px; pointer-events: none;
        }
        .wm-toast {
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%);
            border: 1px solid rgba(255,255,255,0.1);
            border-left: 4px solid #fbbf24;
            border-radius: 12px; padding: 14px 16px;
            color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 13px; box-shadow: 0 12px 32px rgba(0,0,0,0.6);
            pointer-events: auto; animation: wmSlideIn 0.3s ease-out;
        }
        .wm-toast.urgent { border-left-color: #ef4444; }
        .wm-toast.expired { border-left-color: #6b7280; opacity: 0.8; }
        .wm-toast-title { font-weight: 700; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .wm-toast-title .wm-toast-close { background: none; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 0; line-height: 1; }
        .wm-toast-title .wm-toast-close:hover { color: white; }
        .wm-toast-body { font-size: 12px; color: #cbd5e1; margin-bottom: 10px; line-height: 1.4; }
        .wm-toast-timer { font-family: monospace; color: #fbbf24; font-weight: bold; }
        .wm-toast-actions { display: flex; gap: 6px; }
        .wm-toast-btn {
            padding: 6px 12px; border-radius: 7px; border: none;
            font-size: 11px; font-weight: 600; cursor: pointer;
            transition: all 0.15s;
        }
        .wm-toast-btn.view { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; }
        .wm-toast-btn.dismiss { background: rgba(51, 65, 85, 0.7); color: #cbd5e1; }
        .wm-toast-btn:hover { filter: brightness(1.15); }
        @keyframes wmSlideIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }

        #wm-trade-helper {
            position: sticky; top: 0; z-index: 5;
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%);
            border-bottom: 1px solid rgba(99, 102, 241, 0.25);
            padding: 10px 16px;
            display: flex; justify-content: space-between; align-items: center; gap: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #wm-trade-helper .wm-th-label {
            font-size: 10px; color: #94a3b8;
            text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;
        }
        #wm-trade-helper .wm-th-value {
            font-size: 16px; font-weight: 800; color: #fbbf24;
            font-family: monospace;
        }
        #wm-trade-helper .wm-th-side { display: flex; flex-direction: column; gap: 3px; }
        #wm-trade-helper .wm-th-count { font-size: 12px; color: #cbd5e1; font-weight: 500; }

        /* ===== Patch Notes ===== */
        .wm-patch-item {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px; padding: 10px; margin-bottom: 8px;
        }
        .wm-patch-item:last-child { margin-bottom: 0; }
        .wm-patch-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05);
            padding-bottom: 4px;
        }
        .wm-patch-version { font-weight: 700; color: #a5b4fc; font-size: 13px; }
        .wm-patch-date { font-family: monospace; color: #94a3b8; font-size: 10px; }
        .wm-patch-changes { margin: 0; padding-left: 16px; font-size: 11px; color: #cbd5e1; }
        .wm-patch-changes li { margin-bottom: 4px; line-height: 1.3; }

        /* ===== Smart Trades (Routines) ===== */
        .wm-st-list { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; padding-right: 4px; }
        .wm-st-card { background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 10px; transition: border-color 0.15s; }
        .wm-st-card:hover { border-color: rgba(99, 102, 241, 0.5); }
        .wm-st-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px; }
        .wm-st-title { font-weight: 700; color: #e5e7eb; font-size: 13px; }
        .wm-st-friend { font-size: 11px; color: #a5b4fc; background: rgba(79, 70, 229, 0.15); padding: 2px 6px; border-radius: 4px; }
        .wm-st-rules { font-size: 10px; color: #94a3b8; margin-bottom: 8px; display: flex; flex-direction: column; gap: 2px; }
        .wm-st-rule span { color: #cbd5e1; font-weight: 600; }
        .wm-st-actions { display: flex; gap: 6px; }

        /* ===== Modales internes (Création & Exécution) ===== */
        .wm-internal-modal { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.98); z-index: 10; display: none; flex-direction: column; padding: 12px; animation: fadeIn 0.15s; }
        .wm-internal-modal.show { display: flex; }
        .wm-trade-container { display: flex; gap: 8px; margin: 8px 0; flex: 1; min-height: 0; }
        .wm-trade-side { flex: 1; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
        .wm-trade-header { font-size: 11px; color: #cbd5e1; font-weight: 700; display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px; }
        .wm-trade-val { color: #fbbf24; font-family: monospace; }
        .wm-trade-list { flex: 1; overflow-y: auto; background: rgba(15, 23, 42, 0.5); border-radius: 6px; padding: 4px; display: flex; flex-direction: column; gap: 4px; }
        .wm-trade-item { display: flex; justify-content: space-between; align-items: center; background: rgba(51, 65, 85, 0.8); padding: 4px 6px; border-radius: 4px; font-size: 10px; color: #e5e7eb; }
        .wm-trade-item-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; }
        .wm-trade-item-remove { color: #ef4444; cursor: pointer; font-weight: bold; padding: 0 4px; }

        /* ===== Modale Grand Format (Smart Trade) ===== */
        #wm-st-overlay {
            position: fixed; inset: 0; z-index: 100000;
            background: rgba(0,0,0,0.8); backdrop-filter: blur(6px);
            display: none; align-items: center; justify-content: center;
        }
        #wm-st-overlay.show { display: flex; animation: fadeIn 0.15s; }
        .wm-st-large-modal {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            border: 1px solid rgba(99, 102, 241, 0.4);
            border-radius: 14px; padding: 24px;
            width: 90%; max-width: 800px; max-height: 90vh;
            color: #e5e7eb; display: flex; flex-direction: column; gap: 16px;
            box-shadow: 0 24px 48px rgba(0,0,0,0.7);
        }
        .wm-st-large-modal .wm-panel-input { font-size: 14px; padding: 10px; }
        .wm-trade-wb-container {
            display: flex; align-items: center; justify-content: space-between;
            background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px; padding: 6px 10px; margin-top: 4px;
        }
        .wm-trade-wb-label { font-size: 11px; color: #94a3b8; }
        .wm-trade-wb-input {
            background: transparent; border: none; color: #fbbf24; font-family: monospace;
            font-size: 14px; width: 80px; text-align: right; outline: none;
        }

        /* ===== Modale de Prévisualisation Grand Format ===== */
        #wm-preview-overlay {
            position: fixed; inset: 0; z-index: 999999;
            background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px);
            display: none; align-items: center; justify-content: center;
            animation: fadeIn 0.15s ease;
        }
        #wm-preview-overlay.show { display: flex; }
        .wm-preview-box {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            border: 1px solid rgba(99, 102, 241, 0.5);
            border-radius: 16px; padding: 24px;
            width: 90%; max-width: 400px;
            color: #e5e7eb; display: flex; flex-direction: column; gap: 16px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.8);
            position: relative; text-align: center;
        }
        .wm-preview-close {
            position: absolute; top: 12px; right: 12px;
            background: transparent; border: none; color: #94a3b8;
            font-size: 20px; cursor: pointer;
        }
        .wm-preview-close:hover { color: #fff; }
        .wm-preview-img-container {
            width: 100%; height: 300px; border-radius: 10px; overflow: hidden;
            position: relative; background: #000; border: 1px solid rgba(255,255,255,0.1);
        }
        .wm-preview-img-container img { width: 100%; height: 100%; object-fit: contain; }
        .wm-preview-title { font-size: 18px; font-weight: bold; color: #fff; font-family: var(--font-heading, sans-serif); }
        .wm-preview-desc { font-size: 12px; color: #94a3b8; line-height: 1.4; max-height: 100px; overflow-y: auto; text-align: left; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; }
        .wm-preview-stats { display: flex; justify-content: space-around; background: rgba(30, 41, 59, 0.7); padding: 10px; border-radius: 8px; font-size: 14px; font-weight: bold; }

        /* ===== Groupes de Tags & Auto-Tag ===== */
        .wm-auto-tag-panel {
            display: flex; align-items: center; justify-content: space-between;
            background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 8px; padding: 12px; margin-bottom: 16px;
        }
        .wm-auto-tag-lbl { font-size: 13px; font-weight: bold; color: #10b981; }

        .wm-tag-group {
            background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px; margin-bottom: 8px; overflow: hidden;
        }
        .wm-tag-group-header {
            padding: 10px 12px; background: rgba(15, 23, 42, 0.6);
            display: flex; justify-content: space-between; align-items: center;
            cursor: pointer; transition: background 0.2s;
        }
        .wm-tag-group-header:hover { background: rgba(30, 41, 59, 0.8); }
        .wm-tag-group-title { font-size: 13px; font-weight: bold; color: #e5e7eb; }

        .wm-tag-group-content {
            padding: 12px; display: none; flex-direction: column; gap: 8px;
            border-top: 1px solid rgba(255,255,255,0.05);
        }
        .wm-tag-group.open .wm-tag-group-content { display: flex; }

        .wm-tag-rule-row {
            display: flex; align-items: center; justify-content: space-between;
            background: rgba(15, 23, 42, 0.4); padding: 6px 10px; border-radius: 6px;
        }
        .wm-tag-badge {
            font-size: 10px; padding: 2px 6px; border-radius: 12px;
            color: #000; font-weight: bold;
        }
    `);
    // GM_addStyle fin


})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
