'use strict';
'require view';
'require form';
'require rpc';
'require poll';
'require ui';
'require uci';
'require fs';

var callInitAction = rpc.declare({
    object: 'luci',
    method: 'setInitAction',
    params: [ 'name', 'action' ],
    expect: { result: false }
});

// ─── Browser preset table ────────────────────────────────────────────
// Empty string  = clear the UCI option → binary uses its built-in default
// null          = keep whatever the user typed (Custom mode)
var BROWSER_PRESETS = [
    {
        id:      'default',
        label:   'Binary default (Opera 114 / Chrome 128, Windows)',
        version: '',
        type:    '',
        ua:      ''
    },
    {
        id:      'opera130_win',
        label:   'Opera 130 / Chrome 146 — Windows',
        version: 'Stable 130.0.5847.12',
        type:    'se0316',
        ua:      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 OPR/130.0.0.0'
    },
    {
        id:      'opera114_win',
        label:   'Opera 114 / Chrome 128 — Windows (built-in default)',
        version: 'Stable 114.0.5282.21',
        type:    'se0316',
        ua:      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/114.0.0.0'
    },
    {
        id:      'opera100_win',
        label:   'Opera 100 / Chrome 114 — Windows',
        version: 'Stable 100.0.4896.127',
        type:    'se0316',
        ua:      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 OPR/100.0.0.0'
    },
    {
        id:      'opera90_mac',
        label:   'Opera 90 / Chrome 104 — macOS',
        version: 'Stable 90.0.4480.54',
        type:    'se0316',
        ua:      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36 OPR/90.0.0.0'
    },
    {
        id:      'custom',
        label:   '[ Custom — fill fields manually below ]',
        version: null,
        type:    null,
        ua:      null
    }
];

function presetById(id) {
    for (var i = 0; i < BROWSER_PRESETS.length; i++)
        if (BROWSER_PRESETS[i].id === id)
            return BROWSER_PRESETS[i];
    return null;
}

function detectPreset(ver, type, ua) {
    if (!ver && !type && !ua)
        return 'default';
    for (var i = 0; i < BROWSER_PRESETS.length; i++) {
        var p = BROWSER_PRESETS[i];
        if (p.id === 'default' || p.id === 'custom')
            continue;
        if (p.version === ver && p.type === type && p.ua === ua)
            return p.id;
    }
    return 'custom';
}

// ─── Helpers ─────────────────────────────────────────────────────────
function firstPid(text) {
    var m = String(text || '').trim().match(/^(\d+)/);
    return m ? m[1] : null;
}

function formatKBToMB(kb) {
    var n = parseInt(kb, 10);
    if (isNaN(n) || n < 0)
        return '-';
    return (n / 1024).toFixed(1) + ' MB';
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function badge(label, color) {
    return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-weight:600;color:var(--on-primary-color,#fff);background:' +
        color + '">' + escapeHtml(label) + '</span>';
}

function csvUnquote(s) {
    return String(s || '').replace(/^"|"$/g, '').replace(/""/g, '"');
}

function parseCountryCsv(text) {
    var out = [];
    var lines = String(text || '').trim().split(/\r?\n/);
    for (var i = 1; i < lines.length; i++) {
        var line = lines[i];
        if (!line) continue;
        var m = line.match(/^\s*"?([^",]+)"?\s*,\s*"?(.*?)"?\s*$/);
        if (!m) continue;
        out.push({ code: csvUnquote(m[1]), name: csvUnquote(m[2]) });
    }
    return out;
}

var FIELD_HELP = {
    'Enable service': 'Starts Opera Proxy automatically through procd. Disable this only when you want the package installed but the proxy stopped.',
    'Country': 'Preferred Opera VPN region. This influences which SurfEasy/Opera exit pool is requested. EU is the safest general default.',
    'SOCKS5 mode': 'Enabled: listen as SOCKS5. Disabled: listen as HTTP proxy. SOCKS5 is usually preferable for applications that support remote DNS through the proxy.',
    'Listen address': 'Local address and port exposed by opera-proxy, for example 127.0.0.1:18080. Keep 127.0.0.1 unless LAN clients must connect directly.',
    'Verbosity': 'Log detail level passed to the binary. Higher values produce more diagnostic output and more log noise.',
    'Request timeout': 'Maximum time for API and proxy operations before they are treated as failed. Increase only on very slow or unstable links.',
    'Endpoint refresh interval': 'How often Opera proxy endpoints are rediscovered. Shorter values refresh more often but create more API traffic.',
    'Server selection': 'How a working Opera endpoint is chosen: fastest probes candidates, random spreads choices, first uses the first usable endpoint.',
    'Bootstrap DNS': 'Resolver used while bootstrapping SurfEasy/Opera API access. DoT and DoH can help when local DNS is filtered or poisoned.',
    'Upstream proxy': 'Optional proxy used for Opera tunnel traffic itself. Leave empty for a direct connection to selected Opera endpoints.',
    'API proxy': 'Optional explicit proxy used only for SurfEasy/Opera API registration and discovery. Useful when the API is blocked but tunnel endpoints are reachable.',
    'Automatic community API fallback': 'If direct API access fails, automatically try public proxy lists to restore registration and endpoint discovery.',
    'Fallback parallelism': 'Number of community API proxy candidates tested concurrently. Larger values are faster but consume more RAM, sockets and bandwidth.',
    'Fallback candidate limit': 'Maximum number of community proxy candidates considered in one fallback round. Lower this on low-RAM routers.',
    'API proxy list file': 'Optional local text file with extra HTTP/SOCKS proxies used for API fallback, one proxy per line.',
    'API proxy list URL': 'Optional remote list of extra proxy candidates for API fallback. Leave empty unless you maintain or trust a specific list.',
    'Go memory soft limit (MiB)': 'Soft memory target for the Go runtime. 0 disables it. On old MIPS routers a moderate limit can reduce memory pressure.',
    'Tunnel idle timeout': 'Closes tunnels that stay inactive for this duration. 0 disables the timeout. Useful to reclaim stale connections on small routers.',
    'CA file': 'Custom CA bundle used for TLS verification. Usually leave empty to use the system CA bundle.',
    'Fake SNI': 'Advanced compatibility override for the API TLS bootstrap path. Leave empty unless you know the exact workaround you need.',
    'Override proxy address': 'Forces a specific Opera upstream endpoint instead of discovered addresses. Diagnostic/advanced option; normally leave empty.',
    'Browser profile preset': 'Convenience preset for the Opera/Chrome identity sent to the SurfEasy API. It fills the three identity fields below.',
    'Client version': 'Opera client version string reported to the SurfEasy API. Leave empty to use the binary default.',
    'Client type': 'SurfEasy client type identifier, normally se0316. Change only when testing API compatibility.',
    'User-Agent string': 'Browser User-Agent sent to SurfEasy. Leave empty to use the binary default or select a preset above.',
    'Runtime state': 'Live process status, memory use, selected country, listener and browser identity. Refreshed automatically.',
    'Actions': 'Start, stop or restart the service, or run the five-service connectivity test through the current proxy.',
    'Live log output': 'Recent opera-proxy messages from logread. Use this when discovery, fallback or upstream TLS fails.'
};

var SECTION_HELP = {
    'Live Status': 'Current process state and quick service controls. This section contains no persistent settings.',
    'Configuration': 'Main runtime and resilience settings. Most users only need country, proxy mode and listen address.',
    'Browser Identity (Spoofing)': 'SurfEasy/Opera API client identity overrides. Keep the defaults unless a server-side compatibility change requires another profile.',
    'Diagnostics': 'On-demand connectivity tests and logs. Safe to keep collapsed during normal operation.'
};

function decorateHelp(root) {
    root.querySelectorAll('.cbi-value').forEach(function(row) {
        var title = row.querySelector('.cbi-value-title');
        if (!title || title.querySelector('.opera-help'))
            return;
        var key = String(title.textContent || '').trim();
        var help = FIELD_HELP[key];
        if (!help)
            return;
        title.appendChild(E('span', {
            'class': 'opera-help',
            'data-tooltip': help,
            'title': help,
            'tabindex': '0',
            'aria-label': help,
            'style': 'display:inline-flex;align-items:center;justify-content:center;margin-left:.45em;width:1.25em;height:1.25em;border:1px solid var(--border-color-medium,rgba(128,128,128,.35));border-radius:50%;font-size:.78em;font-weight:700;cursor:help;color:var(--primary-color-high,#1976d2);vertical-align:middle'
        }, '?'));
    });
}

function makeSectionsCollapsible(root) {
    var stateKey = 'opera-proxy-section-state-v1';
    var saved = {};
    try { saved = JSON.parse(window.localStorage.getItem(stateKey) || '{}') || {}; } catch (e) {}

    root.querySelectorAll('.cbi-section').forEach(function(section) {
        var heading = section.querySelector(':scope > h3, :scope > h4');
        if (!heading)
            return;
        var name = String(heading.textContent || '').trim();
        if (!SECTION_HELP[name] || heading.dataset.operaCollapsible === '1')
            return;

        heading.dataset.operaCollapsible = '1';
        heading.style.cursor = 'pointer';
        heading.style.userSelect = 'none';
        heading.style.display = 'flex';
        heading.style.alignItems = 'center';
        heading.style.gap = '.45em';
        heading.setAttribute('role', 'button');
        heading.setAttribute('tabindex', '0');

        var info = E('span', {
            'class': 'opera-help',
            'data-tooltip': SECTION_HELP[name],
            'title': SECTION_HELP[name],
            'tabindex': '0',
            'aria-label': SECTION_HELP[name],
            'style': 'display:inline-flex;align-items:center;justify-content:center;width:1.25em;height:1.25em;border:1px solid var(--border-color-medium,rgba(128,128,128,.35));border-radius:50%;font-size:.72em;font-weight:700;color:var(--primary-color-high,#1976d2);cursor:help'
        }, '?');

        var chevron = E('span', {
            'style': 'margin-left:auto;font-size:.9em;color:var(--text-color-medium,#6b7280)'
        }, '▾');

        heading.appendChild(info);
        heading.appendChild(chevron);

        var body = Array.prototype.filter.call(section.children, function(el) { return el !== heading; });
        var defaultOpen = (name === 'Live Status');
        var open = Object.prototype.hasOwnProperty.call(saved, name) ? !!saved[name] : defaultOpen;

        function apply() {
            body.forEach(function(el) { el.style.display = open ? '' : 'none'; });
            chevron.textContent = open ? '▾' : '▸';
            heading.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        function toggle(ev) {
            if (ev && ev.target && ev.target.classList && ev.target.classList.contains('opera-help'))
                return;
            open = !open;
            saved[name] = open;
            try { window.localStorage.setItem(stateKey, JSON.stringify(saved)); } catch (e) {}
            apply();
        }

        heading.addEventListener('click', toggle);
        heading.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                toggle(ev);
            }
        });
        info.addEventListener('click', function(ev) { ev.stopPropagation(); });
        apply();
    });
}

// ─── View ─────────────────────────────────────────────────────────────
return view.extend({
    _statusNode:     null,
    _actionNode:     null,
    _logNode:        null,
    _buttons:        [],
    _pollRegistered: false,
    _countries:      null,

    load: function() {
        return Promise.all([
            uci.load('opera-proxy'),
            L.resolveDefault(fs.exec_direct('/usr/bin/opera-proxy', ['-list-countries'], 'text'), '')
        ]).then(L.bind(function(res) {
            var parsed = parseCountryCsv(res[1]);
            if (!parsed.length) {
                parsed = [
                    { code: 'EU', name: 'Europe' },
                    { code: 'AM', name: 'Americas' },
                    { code: 'AS', name: 'Asia' }
                ];
            }
            this._countries = parsed;
            return res;
        }, this));
    },

    readProcValue: function(pid, field) {
        if (!pid) return Promise.resolve(null);
        return L.resolveDefault(fs.read_direct('/proc/' + pid + '/status'), '').then(function(txt) {
            var m = String(txt || '').match(new RegExp('^' + field + ':\\s+([0-9]+)\\s+kB$', 'm'));
            return m ? m[1] : null;
        });
    },

    fetchRuntime: function() {
        var self = this;
        return L.resolveDefault(fs.exec_direct('/bin/pidof', ['opera-proxy'], 'text'), '').then(function(pidText) {
            var pid     = firstPid(pidText);
            var mode    = (uci.get('opera-proxy', 'main', 'socks_mode') === '1') ? 'SOCKS5' : 'HTTP';
            var bind    = uci.get('opera-proxy', 'main', 'bind_address') || '127.0.0.1:18080';
            var country = uci.get('opera-proxy', 'main', 'country') || 'EU';
            var ver     = uci.get('opera-proxy', 'main', 'api_client_version') || '';

            return Promise.all([
                Promise.resolve(pid),
                self.readProcValue(pid, 'VmRSS'),
                self.readProcValue(pid, 'VmSize'),
                Promise.resolve(mode),
                Promise.resolve(bind),
                Promise.resolve(country),
                Promise.resolve(ver)
            ]);
        }).then(function(res) {
            return { pid: res[0], vmrss: res[1], vmsize: res[2],
                     mode: res[3], bind: res[4], country: res[5], clientVersion: res[6] };
        });
    },

    renderStatusHtml: function(rt) {
        var running   = !!rt.pid;
        var modeColor = rt.mode === 'SOCKS5' ? 'var(--primary-color-high, #2563eb)' : 'var(--success-color-medium, #059669)';
        var verLabel  = rt.clientVersion ? escapeHtml(rt.clientVersion) : '<em>(binary default)</em>';
        return [
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;align-items:stretch">',
              '<div style="padding:10px;border:1px solid var(--border-color-medium,rgba(128,128,128,.35));border-radius:10px;background:var(--background-color-low,rgba(128,128,128,.06));color:var(--text-color-highest,inherit)">',
                '<div style="font-size:12px;color:var(--text-color-medium,#6b7280);margin-bottom:6px">Service state</div>',
                '<div>' + badge(running ? 'Running' : 'Stopped', running ? 'var(--success-color-medium, #16a34a)' : 'var(--error-color-medium, #dc2626)') + '</div>',
                '<div style="margin-top:8px"><strong>PID:</strong> ' + escapeHtml(rt.pid || '-') + '</div>',
                '<div style="margin-top:4px"><strong>RSS:</strong> ' + formatKBToMB(rt.vmrss) + '</div>',
              '</div>',
              '<div style="padding:10px;border:1px solid var(--border-color-medium,rgba(128,128,128,.35));border-radius:10px;background:var(--background-color-low,rgba(128,128,128,.06));color:var(--text-color-highest,inherit)">',
                '<div style="font-size:12px;color:var(--text-color-medium,#6b7280);margin-bottom:6px">Proxy mode</div>',
                '<div>' + badge(rt.mode, modeColor) + '</div>',
                '<div style="margin-top:8px"><strong>Listen:</strong> ' + escapeHtml(rt.bind) + '</div>',
                '<div style="margin-top:4px"><strong>Country:</strong> ' + escapeHtml(rt.country) + '</div>',
              '</div>',
              '<div style="padding:10px;border:1px solid var(--border-color-medium,rgba(128,128,128,.35));border-radius:10px;background:var(--background-color-low,rgba(128,128,128,.06));color:var(--text-color-highest,inherit)">',
                '<div style="font-size:12px;color:var(--text-color-medium,#6b7280);margin-bottom:6px">Browser identity</div>',
                '<div style="font-size:12px;word-break:break-all"><strong>Client ver:</strong> ' + verLabel + '</div>',
                '<div style="margin-top:8px"><strong>VmSize:</strong> ' + formatKBToMB(rt.vmsize) + '</div>',
              '</div>',
            '</div>',
            '<div style="margin-top:8px;color:var(--text-color-medium,#6b7280)">Status via <code>pidof opera-proxy</code> and <code>/proc/&lt;pid&gt;/status</code>.</div>'
        ].join('');
    },

    refreshStatus: function() {
        if (!this._statusNode) return Promise.resolve();
        return this.fetchRuntime().then(L.bind(function(rt) {
            this._statusNode.innerHTML = this.renderStatusHtml(rt);
        }, this)).catch(L.bind(function(err) {
            this._statusNode.innerHTML =
                '<div style="color:var(--error-color-medium,#b91c1c)"><strong>Status read failed:</strong> ' +
                escapeHtml((err && err.message) || 'unknown error') + '</div>';
        }, this));
    },

    refreshLogs: function() {
        if (!this._logNode) return Promise.resolve();
        this._logNode.value = 'Refreshing logs...';
        return L.resolveDefault(fs.exec_direct('/sbin/logread', ['-e', 'opera-proxy'], 'text'), '')
            .then(L.bind(function(out) {
                this._logNode.value = String(out || '').trim() || 'No opera-proxy log entries yet.';
                this._logNode.scrollTop = this._logNode.scrollHeight;
            }, this))
            .catch(L.bind(function(err) {
                this._logNode.value = (err && err.message) ? err.message : 'Unable to read logs.';
            }, this));
    },

    setActionState: function(busy, text) {
        if (this._actionNode)
            this._actionNode.textContent = text || '';
        this._buttons.forEach(function(btn) { if (btn) btn.disabled = !!busy; });
    },

    handleServiceAction: function(action) {
        return ui.createHandlerFn(this, function(ev) {
            if (ev) ev.preventDefault();
            this.setActionState(true, 'Executing action: ' + action + ' ...');
            return callInitAction('opera-proxy', action)
                .then(function() {
                    return new Promise(function(r) { window.setTimeout(r, 1500); });
                })
                .then(L.bind(function() {
                    return Promise.all([ this.refreshStatus(), this.refreshLogs() ]);
                }, this))
                .then(L.bind(function() {
                    this.setActionState(false, 'Last action completed: ' + action);
                }, this))
                .catch(L.bind(function(err) {
                    var msg = (err && err.message) ? err.message : 'Operation failed';
                    this.setActionState(false, msg);
                    ui.addNotification(null, E('p', {}, msg));
                }, this));
        });
    },

    handleProxyTest: function() {
        return ui.createHandlerFn(this, function(ev) {
            if (ev) ev.preventDefault();

            this.setActionState(true, 'Testing Telegram API, GitHub, Claude, YouTube and ChatGPT through Opera Proxy ...');

            return fs.exec_direct('/usr/libexec/opera-proxy-probe', [], 'text')
                .then(L.bind(function(out) {
                    var lines = String(out || '').trim().split(/\r?\n/).filter(function(line) { return !!line; });
                    var results = lines.map(function(line) {
                        var p = line.split('|');
                        return {
                            name: p[0] || 'Unknown',
                            status: p[1] || 'error',
                            code: p[2] || '000',
                            ms: parseInt(p[3] || '0', 10) || 0
                        };
                    });

                    if (!results.length)
                        throw new Error('Proxy probe returned no results');

                    var ok = 0, reachable = 0;
                    var rows = results.map(function(r) {
                        var good = r.status === 'ok';
                        var partial = r.status === 'reachable';
                        if (good) ok++;
                        else if (partial) reachable++;

                        var mark = good ? '✓' : (partial ? '!' : '✗');
                        var detail;
                        if (r.status === 'proxy_down')
                            detail = 'proxy service is not running';
                        else if (r.status === 'timeout')
                            detail = 'timeout';
                        else if (r.status === 'blocked')
                            detail = 'blocked, HTTP ' + r.code;
                        else if (r.status === 'error')
                            detail = 'probe error';
                        else
                            detail = 'HTTP ' + r.code + ', ' + r.ms + ' ms';

                        return E('li', {
                            'style': 'margin:.25em 0;color:' + (good ? 'var(--success-color-medium,#15803d)' : (partial ? 'var(--warn-color-high,#a16207)' : 'var(--error-color-medium,#b91c1c)'))
                        }, [ mark + ' ', E('strong', {}, r.name), ' — ' + detail ]);
                    });

                    var summary = ok + '/5 services OK' + (reachable ? ', ' + reachable + ' reachable with unexpected HTTP status' : '');
                    this.setActionState(false, 'Proxy test: ' + summary);
                    ui.addNotification(null, E('div', {}, [
                        E('strong', {}, 'Opera Proxy connectivity: ' + summary),
                        E('ul', { 'style': 'margin:.5em 0 0 1.2em' }, rows)
                    ]));
                    return Promise.all([ this.refreshStatus(), this.refreshLogs() ]);
                }, this))
                .catch(L.bind(function(err) {
                    var msg = (err && err.message) ? err.message : 'Proxy test failed';
                    this.setActionState(false, msg);
                    ui.addNotification(null, E('p', {}, msg));
                }, this));
        });
    },

    // ── Browser section helper ────────────────────────────────────────
    _makeBrowserSection: function(s) {
        var o;

        // Preset selector — written first in the section
        o = s.option(form.ListValue, '_browser_preset', 'Browser profile preset');
        BROWSER_PRESETS.forEach(function(p) { o.value(p.id, p.label); });
        o.rmempty = true;

        // Read current UCI to detect active preset
        o.cfgvalue = function(section_id) {
            var ver  = uci.get('opera-proxy', section_id, 'api_client_version') || '';
            var type = uci.get('opera-proxy', section_id, 'api_client_type')    || '';
            var ua   = uci.get('opera-proxy', section_id, 'api_user_agent')     || '';
            return detectPreset(ver, type, ua);
        };

        // Auto-fill the three fields below when a preset is selected
        o.onchange = function(ev, section_id, value) {
            var preset = presetById(value);
            if (!preset || preset.id === 'custom') return;

            function fillInput(selector, val) {
                var el = document.querySelector(selector);
                if (!el) return;
                el.value = val || '';
                el.dispatchEvent(new Event('input',  { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            fillInput('[data-browser-field="api_client_version"] input', preset.version);
            fillInput('[data-browser-field="api_client_type"] input',    preset.type);
            fillInput('[data-browser-field="api_user_agent"] input',     preset.ua);
        };

        // Preset is a UI-only helper — never write it to UCI
        o.write  = function() {};
        o.remove = function() {};

        // Real UCI fields with data-browser-field markers for onchange targeting
        function makeField(opt, label, placeholder, desc) {
            var f = s.option(form.Value, opt, label);
            f.rmempty     = true;
            f.placeholder = placeholder;
            if (desc) f.description = desc;

            // Wrap render to inject the data attribute used by onchange
            var _render = f.render.bind(f);
            f.render = function() {
                return Promise.resolve(_render.apply(this, arguments)).then(function(node) {
                    if (node) {
                        node.setAttribute('data-browser-field', opt);
                        node.style.borderLeft  = '3px solid var(--primary-color-high,#93c5fd)';
                        node.style.paddingLeft = '8px';
                        node.style.marginLeft  = '4px';
                    }
                    return node;
                });
            };
            return f;
        }

        makeField('api_client_version', 'Client version',
            '(binary default: Stable 114.0.5282.21)',
            'Passed as -api-client-version. Leave empty to use the binary built-in default.');

        makeField('api_client_type', 'Client type',
            '(binary default: se0316)',
            'Passed as -api-client-type.');

        makeField('api_user_agent', 'User-Agent string',
            '(binary default: OPR/114 UA)',
            'Passed as -api-user-agent. Identifies this client to the SurfEasy API.');
    },

    render: function() {
        var m, s, o;
        var self = this;

        m = new form.Map('opera-proxy', 'Opera Proxy',
            'Opera Proxy for OpenWrt — LuCI panel with runtime status, colored mode badge, browser identity spoofing and built-in proxy test.');

        // ── Live Status ─────────────────────────────────────────────
        s = m.section(form.TypedSection, 'service', 'Live Status');
        s.anonymous = true;

        o = s.option(form.DummyValue, '_status', 'Runtime state',
            'Service state, PID, mode, listen address, active browser identity and memory usage.');
        o.rawhtml = true;
        o.cfgvalue = function() {
            return '<div data-opera-proxy-status="1">Loading status...</div>';
        };

        o = s.option(form.DummyValue, '_actions', 'Actions');
        o.rawhtml = true;
        o.cfgvalue = function() {
            return [
                '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">',
                '<button type="button" class="btn cbi-button cbi-button-action"  data-opera-action="start">Start</button>',
                '<button type="button" class="btn cbi-button cbi-button-remove"  data-opera-action="stop">Stop</button>',
                '<button type="button" class="btn cbi-button cbi-button-action"  data-opera-action="restart">Restart</button>',
                '<button type="button" class="btn cbi-button cbi-button-action important" data-opera-action="test">Test proxy</button>',
                '</div>',
                '<div data-opera-action-state="1" style="margin-top:8px;min-height:1.4em;color:var(--text-color-medium,#6b7280)">No action executed yet.</div>'
            ].join('');
        };

        // ── Configuration ───────────────────────────────────────────
        s = m.section(form.TypedSection, 'service', 'Configuration');
        s.anonymous = true;

        o = s.option(form.Flag, 'enabled', 'Enable service');
        o.rmempty = false;

        o = s.option(form.ListValue, 'country', 'Country');
        (this._countries || []).forEach(function(entry) {
            o.value(entry.code, entry.code + ' — ' + entry.name);
        });
        o.default = 'EU';
        o.rmempty = false;

        o = s.option(form.Flag, 'socks_mode', 'SOCKS5 mode');
        o.default     = '1';
        o.rmempty     = false;
        o.description = 'Enabled = SOCKS5 proxy. Disabled = HTTP proxy.';

        o = s.option(form.Value, 'bind_address', 'Listen address');
        o.datatype   = 'hostport';
        o.placeholder = '127.0.0.1:18080';
        o.rmempty    = false;

        o = s.option(form.Value, 'verbosity', 'Verbosity');
        o.datatype = 'uinteger';
        o.default  = '20';
        o.rmempty  = false;

        o = s.option(form.Value, 'timeout', 'Request timeout');
        o.placeholder = '10s';
        o.rmempty     = false;

        o = s.option(form.Value, 'refresh', 'Endpoint refresh interval');
        o.placeholder = '4h';
        o.rmempty     = false;

        o = s.option(form.ListValue, 'server_selection', 'Server selection');
        o.value('fastest', 'fastest');
        o.value('random',  'random');
        o.value('first',   'first');
        o.default = 'fastest';
        o.rmempty = false;

        o = s.option(form.Value, 'bootstrap_dns', 'Bootstrap DNS');
        o.placeholder = 'tls://9.9.9.9:853';
        o.default     = 'tls://9.9.9.9:853';
        o.rmempty     = true;
        o.description = 'DNS resolver for SurfEasy API bootstrap. Supports plain (8.8.8.8), DoT (tls://9.9.9.9:853) and DoH (https://...) formats. Passed as -bootstrap-dns.';

        o = s.option(form.Value, 'proxy', 'Upstream proxy');
        o.placeholder = 'socks5://127.0.0.1:1080';
        o.rmempty     = true;
        o.placeholder = 'socks5://127.0.0.1:1080';
        o.rmempty     = true;

        o = s.option(form.Value, 'api_proxy', 'API proxy');
        o.placeholder = 'http://127.0.0.1:8080';
        o.rmempty     = true;

        o = s.option(form.Flag, 'api_proxy_builtin', 'Automatic community API fallback');
        o.default = '1';
        o.rmempty = false;
        o.description = 'If direct SurfEasy API access or direct endpoint discovery fails, try public community proxy lists automatically.';

        o = s.option(form.Value, 'api_proxy_parallel', 'Fallback parallelism');
        o.datatype = 'uinteger';
        o.default = '15';
        o.rmempty = false;

        o = s.option(form.Value, 'api_proxy_max', 'Fallback candidate limit');
        o.datatype = 'uinteger';
        o.default = '60';
        o.rmempty = false;

        o = s.option(form.Value, 'api_proxy_file', 'API proxy list file');
        o.placeholder = '/etc/opera-proxy/proxies.txt';
        o.rmempty = true;

        o = s.option(form.Value, 'api_proxy_list_url', 'API proxy list URL');
        o.placeholder = 'https://example.net/proxies.txt';
        o.rmempty = true;

        o = s.option(form.Value, 'mem_limit_mb', 'Go memory soft limit (MiB)');
        o.datatype = 'uinteger';
        o.default = '0';
        o.rmempty = false;
        o.description = '0 disables the runtime memory limit. Useful on low-RAM routers.';

        o = s.option(form.Value, 'idle_timeout', 'Tunnel idle timeout');
        o.placeholder = '0';
        o.default = '0';
        o.rmempty = false;
        o.description = '0 disables it; examples: 10m, 30m. Drops silent tunnels after the specified inactivity period.';

        o = s.option(form.Value, 'cafile', 'CA file');
        o.placeholder = '/etc/ssl/certs/ca-certificates.crt';
        o.rmempty     = true;

        o = s.option(form.Value, 'fake_sni', 'Fake SNI');
        o.rmempty = true;

        o = s.option(form.Value, 'override_proxy_address', 'Override proxy address');
        o.placeholder = '1.2.3.4:443';
        o.rmempty     = true;

        // ── Browser Identity ────────────────────────────────────────
        s = m.section(form.TypedSection, 'service', 'Browser Identity (Spoofing)');
        s.anonymous   = true;
        s.description = 'Controls which Opera/Chrome version the proxy reports to the SurfEasy API. ' +
            'Choose a preset to auto-fill all three fields, or select "Custom" to type values manually. ' +
            'Leave all three fields empty to use the binary built-in defaults (no flags passed).';

        this._makeBrowserSection(s);

        // ── Diagnostics ─────────────────────────────────────────────
        s = m.section(form.TypedSection, 'service', 'Diagnostics');
        s.anonymous = true;

        o = s.option(form.DummyValue, '_diag', 'Live log output',
            'Runs logread only when refreshed manually or after service actions.');
        o.rawhtml = true;
        o.cfgvalue = function() {
            return [
                '<details style="margin-top:4px">',
                '<summary style="cursor:pointer;font-weight:600">Show opera-proxy logs</summary>',
                '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">',
                '<button type="button" class="btn cbi-button cbi-button-action" data-opera-refresh-logs="1">Refresh logs</button>',
                '<span style="color:var(--text-color-medium,#6b7280)">Runs: logread -e opera-proxy</span>',
                '</div>',
                '<textarea data-opera-logs="1" readonly="readonly" wrap="off" style="margin-top:10px;width:100%;min-height:220px;font-family:monospace;background:var(--background-color-low,rgba(128,128,128,.06));color:var(--text-color-highest,inherit);border:1px solid var(--border-color-medium,rgba(128,128,128,.35));border-radius:8px;padding:10px"></textarea>',
                '</details>'
            ].join('');
        };

        // ── Wire up DOM ─────────────────────────────────────────────
        return m.render().then(function(nodes) {
            var btnStart   = nodes.querySelector('[data-opera-action="start"]');
            var btnStop    = nodes.querySelector('[data-opera-action="stop"]');
            var btnRestart = nodes.querySelector('[data-opera-action="restart"]');
            var btnTest    = nodes.querySelector('[data-opera-action="test"]');
            var logBtn     = nodes.querySelector('[data-opera-refresh-logs="1"]');

            self._statusNode = nodes.querySelector('[data-opera-proxy-status="1"]');
            self._actionNode = nodes.querySelector('[data-opera-action-state="1"]');
            self._logNode    = nodes.querySelector('[data-opera-logs="1"]');
            self._buttons    = [btnStart, btnStop, btnRestart, btnTest];

            decorateHelp(nodes);
            makeSectionsCollapsible(nodes);

            if (btnStart)   btnStart.addEventListener('click',   self.handleServiceAction('start'));
            if (btnStop)    btnStop.addEventListener('click',    self.handleServiceAction('stop'));
            if (btnRestart) btnRestart.addEventListener('click', self.handleServiceAction('restart'));
            if (btnTest)    btnTest.addEventListener('click',    self.handleProxyTest());
            if (logBtn) {
                logBtn.addEventListener('click', function(ev) {
                    ev.preventDefault();
                    self.refreshLogs();
                });
            }

            self.refreshStatus();
            self.refreshLogs();

            if (!self._pollRegistered) {
                poll.add(function() { return self.refreshStatus(); }, 8);
                self._pollRegistered = true;
            }

            return nodes;
        });
    },

    handleSaveApply: function(ev, mode) {
        var self = this;
        return this.super('handleSaveApply', [ev, mode]).then(function(res) {
            return uci.load('opera-proxy').then(function() {
                return Promise.all([ self.refreshStatus(), self.refreshLogs() ])
                    .then(function() { return res; });
            });
        });
    }
});
