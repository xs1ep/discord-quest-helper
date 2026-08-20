// ================================================================
// Quest Helper — Full Version (Tabs, Logs, Quests, Sanitized)
// ================================================================

(function () {
    if (document.getElementById('quest-helper-root')) return;

    // ---------- CONSTANTS ----------
    const CONFIG = {
        VIDEO_SPEED: 7,
        HEARTBEAT_INTERVAL: 20 * 1000,
        STATUS_CHECK_INTERVAL: 30 * 1000,
        MIN_PID: 1000,
        MAX_PID: 65535,
        JITTER_MS: 2500,
        SUPPORTED_TASKS: ['WATCH_VIDEO', 'PLAY_ON_DESKTOP', 'STREAM_ON_DESKTOP', 'PLAY_ACTIVITY', 'WATCH_VIDEO_ON_MOBILE']
    };

    const STORAGE_KEY = 'questHelperLang';
    const PANEL_ID = 'quest-helper-root';
    const MIN_WIDTH = 320;
    const MIN_HEIGHT = 200;
    const HEADER_HEIGHT = 52;

    // ---------- LOCALIZATION ----------
    let LANG = 'en';
    try {
        if (typeof localStorage !== 'undefined') {
            LANG = localStorage.getItem(STORAGE_KEY) || 'en';
        }
    } catch (e) { console.warn('Quest Helper: localStorage not available'); }

    const TEXTS = {
        en: {
            title: 'Quest Helper',
            tabInfo: 'Info',
            tabLogs: 'Logs',
            author: 'Author',
            authorValue: 'xs1ep',
            version: 'Version',
            versionValue: '2.0.0',
            warning: 'Warning',
            warnText: 'Use at your own risk. Violates platform Terms of Service.',
            langBtn: 'RU',
            minimize: '﹀',
            expand: '︿',
            close: '×',
            start: '▶ Start',
            stop: '⏹ Stop',
            running: '⏳ Running...',
            waiting: 'Waiting...',
            ready: 'Ready',
            logsEmpty: 'No logs yet.',
            copyLogs: '📋 Copy',
            clearLogs: ' Clear',
            noModules: ' Failed to find modules.',
            noQuests: 'No active quests found.',
            foundQuests: (n) => `Found ${n} quests. Starting...`,
            stoppedUser: '⏹ Stopped by user.',
            questDone: '✅ Quest completed!',
            error: (m) => ` Error: ${m}`,
            notImplemented: (t) => `Task type ${t} not implemented yet`
        },
        ru: {
            title: 'Quest Helper',
            tabInfo: 'Инфо',
            tabLogs: 'Логи',
            author: 'Автор',
            authorValue: 'xs1ep',
            version: 'Версия',
            versionValue: '2.0.0',
            warning: 'Предупреждение',
            warnText: 'Используйте на свой страх и риск. Нарушает ToS платформы.',
            langBtn: 'EN',
            minimize: '',
            expand: '︿',
            close: '×',
            start: '▶ Запустить',
            stop: '⏹ Остановить',
            running: '⏳ Выполняется...',
            waiting: 'Ожидание...',
            ready: 'Готово',
            logsEmpty: 'Логи пусты.',
            copyLogs: '📋 Копировать',
            clearLogs: '🗑 Очистить',
            noModules: '❌ Не удалось найти модули.',
            noQuests: 'Активные квесты не найдены.',
            foundQuests: (n) => `Найдено ${n} квестов. Запуск...`,
            stoppedUser: '⏹ Остановлено пользователем.',
            questDone: '✅ Квест завершён!',
            error: (m) => `❌ Ошибка: ${m}`,
            notImplemented: (t) => `Тип задачи ${t} пока не реализован`
        }
    };

    const t = (key, ...args) => {
        const val = TEXTS[LANG][key];
        return typeof val === 'function' ? val(...args) : val;
    };

    const saveLanguage = (lang) => {
        LANG = lang;
        try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    };

    // ---------- STYLES ----------
    const style = document.createElement('style');
    style.textContent = `
        #${PANEL_ID} {
            position: fixed; top: 20px; right: 20px;
            width: 420px; min-width: ${MIN_WIDTH}px; min-height: ${MIN_HEIGHT}px;
            max-height: 90vh;
            background: #17151f; border: 1px solid #2a2740; border-radius: 12px;
            overflow: hidden; color: #e0dee8;
            font-family: 'Segoe UI', system-ui, sans-serif; font-size: 13px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.5); z-index: 999999;
            display: flex; flex-direction: column;
            transition: height 0.2s ease, min-height 0.2s ease;
        }
        #${PANEL_ID} .menu-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px; border-bottom: 1px solid #2a2740; cursor: move;
            flex-shrink: 0;
        }
        #${PANEL_ID} .menu-title { color: #b491ff; font-weight: 600; font-size: 14px; }
        #${PANEL_ID} .menu-header-actions { display: flex; align-items: center; gap: 12px; }
        #${PANEL_ID} .menu-collapse {
            color: #8c88a3; cursor: pointer; font-size: 14px;
            transition: transform 0.15s ease, color 0.15s ease;
        }
        #${PANEL_ID} .menu-collapse:hover { color: #6a8fff; }
        #${PANEL_ID} .menu-close { color: #e0748a; cursor: pointer; font-size: 16px; line-height: 1; }
        #${PANEL_ID} .menu-close:hover { filter: brightness(1.3); }
        #${PANEL_ID} .menu-body { display: flex; flex: 1; min-height: 0; overflow: hidden; }
        #${PANEL_ID} .menu-body.minimized { display: none !important; }
        #${PANEL_ID} .menu-content {
            flex: 1; padding: 18px 20px; display: flex; flex-direction: column;
            gap: 14px; overflow: hidden; min-height: 0;
        }
        #${PANEL_ID} .menu-sidebar {
            width: 130px; background: #14121c; border-right: 1px solid #2a2740;
            padding: 10px 0; display: flex; flex-direction: column; gap: 2px; flex-shrink: 0;
        }
        #${PANEL_ID} .menu-tab {
            padding: 10px 14px; color: #8c88a3; cursor: pointer;
            border-left: 2px solid transparent; transition: all 0.2s;
        }
        #${PANEL_ID} .menu-tab:hover { color: #a9a4c9; }
        #${PANEL_ID} .menu-tab.active {
            color: #b491ff; background: #232035; border-left: 2px solid #6a8fff;
        }
        #${PANEL_ID} .tab-content { display: none; flex: 1; min-height: 0; flex-direction: column; overflow: hidden; }
        #${PANEL_ID} .tab-content.visible { display: flex; }
        #${PANEL_ID} .lang-btn {
            position: absolute; top: 12px; right: 60px;
            background: rgba(106, 143, 255, 0.2); border: 1px solid #6a8fff;
            color: #6ad9ff; border-radius: 6px; padding: 4px 10px;
            font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;
        }
        #${PANEL_ID} .lang-btn:hover { background: rgba(106, 143, 255, 0.3); transform: scale(1.05); }
        #${PANEL_ID} .logs-container {
            flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
            background: #1e1b2e; border: 1px solid #3a3650; border-radius: 8px;
            padding: 10px; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px;
            user-select: text; -webkit-user-select: text; cursor: text;
            white-space: pre-wrap; word-break: break-word;
        }
        #${PANEL_ID} .logs-container::-webkit-scrollbar { width: 8px; }
        #${PANEL_ID} .logs-container::-webkit-scrollbar-track { background: #1e1e2e; border-radius: 4px; }
        #${PANEL_ID} .logs-container::-webkit-scrollbar-thumb { background: #585b70; border-radius: 4px; }
        #${PANEL_ID} .logs-container::-webkit-scrollbar-thumb:hover { background: #6c7086; }
        #${PANEL_ID} .log-line {
            padding: 2px 0 2px 8px; margin: 4px 0; border-radius: 4px;
            user-select: text; -webkit-user-select: text;
        }
        #${PANEL_ID} .log-line:hover { background: rgba(255,255,255,0.03); }
        #${PANEL_ID} .logs-actions { display: flex; gap: 8px; flex-shrink: 0; }
        #${PANEL_ID} .logs-action-btn {
            flex: 1; padding: 6px; border: 1px solid #3a3650; border-radius: 6px;
            background: #1e1b2e; color: #a9a4c9; font-size: 11px; font-weight: 600;
            cursor: pointer; transition: all 0.2s;
        }
        #${PANEL_ID} .logs-action-btn:hover { background: #2a2740; color: #e0dee8; }
        #${PANEL_ID} .btn-start {
            background: linear-gradient(90deg, #8a7cff, #6ad9ff); color: #0f0e1a;
            border: none; border-radius: 8px; padding: 12px; font-weight: 700;
            font-size: 13px; cursor: pointer; transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(138, 124, 255, 0.3);
        }
        #${PANEL_ID} .btn-start:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
        #${PANEL_ID} .btn-stop {
            background: linear-gradient(90deg, #ff6a8a, #ff8a9f); color: #0f0e1a;
            border: none; border-radius: 8px; padding: 12px; font-weight: 700;
            font-size: 13px; cursor: not-allowed; opacity: 0.6; transition: all 0.2s;
        }
        #${PANEL_ID} .btn-stop:not(:disabled) { opacity: 1; cursor: pointer; }
        #${PANEL_ID} .btn-stop:not(:disabled):hover { filter: brightness(1.15); transform: translateY(-1px); }
        #${PANEL_ID} .menu-resize {
            position: absolute; right: 2px; bottom: 2px;
            width: 14px; height: 14px; cursor: nwse-resize; opacity: 0.5;
            transition: opacity 0.2s;
        }
        #${PANEL_ID} .menu-resize:hover { opacity: 1; }
        #${PANEL_ID} .menu-resize svg { display: block; }
    `;
    document.head.appendChild(style);

    // ---------- PANEL ----------
    const root = document.createElement('div');
    root.id = PANEL_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Quest Helper');

    root.innerHTML = `
        <div class="menu-header" id="qh-drag">
            <span class="menu-title" id="qh-title">Quest Helper</span>
            <div class="menu-header-actions">
                <span class="menu-collapse" id="qh-collapse" title="Toggle">﹀</span>
                <span class="menu-close" id="qh-close" title="Close">×</span>
            </div>
        </div>
        <button class="lang-btn" id="qh-lang">RU</button>
        <div class="menu-body" id="qh-body">
            <div class="menu-sidebar" id="qh-sidebar">
                <div class="menu-tab active" id="qh-tab-info">Info</div>
                <div class="menu-tab" id="qh-tab-logs">Logs</div>
            </div>
            <div class="menu-content" id="qh-content">
                <div class="tab-content visible" id="qh-info-content"></div>
                <div class="tab-content" id="qh-logs-content"></div>
            </div>
        </div>
        <div class="menu-resize" id="qh-resize">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 13V3M13 13H3M13 13L7 7" stroke="#8c88a3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
    `;
    document.body.appendChild(root);

    // ---------- ELEMENTS ----------
    const body = document.getElementById('qh-body');
    const collapseBtn = document.getElementById('qh-collapse');
    const closeBtn = document.getElementById('qh-close');
    const dragHandle = document.getElementById('qh-drag');
    const resizeHandle = document.getElementById('qh-resize');
    const langBtn = document.getElementById('qh-lang');
    const tabInfo = document.getElementById('qh-tab-info');
    const tabLogs = document.getElementById('qh-tab-logs');
    const infoContent = document.getElementById('qh-info-content');
    const logsContent = document.getElementById('qh-logs-content');

    let startBtn, stopBtn;
    let isRunning = false;
    let stopFlag = null;

    // ---------- RENDER INFO ----------
    function renderInfoContent() {
        infoContent.innerHTML = '';
        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;';

        const createInfoItem = (label, value) => {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 6px 0; border-bottom: 1px solid rgba(88, 91, 112, 0.3);';
            const labelEl = document.createElement('div');
            labelEl.style.cssText = 'color: #89b4fa; font-weight: 600; font-size: 12px; margin-bottom: 2px;';
            labelEl.textContent = label;
            const valueEl = document.createElement('div');
            valueEl.style.cssText = 'color: #cdd6f4; font-size: 13px;';
            valueEl.textContent = value;
            item.append(labelEl, valueEl);
            return item;
        };

        grid.append(
            createInfoItem(t('author'), t('authorValue')),
            createInfoItem(t('version'), t('versionValue'))
        );
        infoContent.appendChild(grid);

        const warningBox = document.createElement('div');
        warningBox.style.cssText = 'margin-top: 10px; padding: 8px 10px; background: rgba(243, 139, 168, 0.15); border-left: 3px solid #f38ba8; border-radius: 6px;';
        const wLabel = document.createElement('div');
        wLabel.style.cssText = 'color: #f38ba8; font-size: 11px; font-weight: 600;';
        wLabel.textContent = '⚠️ ' + t('warning');
        const wText = document.createElement('div');
        wText.style.cssText = 'font-size: 11px; color: #f5c2e7;';
        wText.textContent = t('warnText');
        warningBox.append(wLabel, wText);
        infoContent.appendChild(warningBox);
    }

    // ---------- RENDER LOGS ----------
    function renderLogsContent() {
        logsContent.innerHTML = '';

        // Progress
        const progressSection = document.createElement('div');
        progressSection.style.cssText = 'margin-bottom: 10px; flex-shrink: 0;';
        const progressWrapper = document.createElement('div');
        progressWrapper.style.cssText = 'background: #1e1e2e; border-radius: 8px; height: 20px; overflow: hidden; border: 1px solid #3a3650;';
        const progressBar = document.createElement('div');
        progressBar.id = 'qh-progress-bar';
        progressBar.style.cssText = 'width: 0%; height: 100%; background: linear-gradient(90deg, #89b4fa, #cba6f7); transition: width 0.4s;';
        progressWrapper.appendChild(progressBar);
        progressSection.appendChild(progressWrapper);

        const progressText = document.createElement('div');
        progressText.id = 'qh-progress-text';
        progressText.style.cssText = 'text-align: center; font-size: 12px; color: #7fe08a; font-weight: 600; margin-top: 6px;';
        progressText.textContent = t('waiting');
        progressSection.appendChild(progressText);
        logsContent.appendChild(progressSection);

        // Action buttons
        const actionsRow = document.createElement('div');
        actionsRow.className = 'logs-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'logs-action-btn';
        copyBtn.textContent = t('copyLogs');
        copyBtn.addEventListener('click', () => {
            const lView = document.getElementById('qh-logs-view');
            if (!lView) return;
            const text = lView.innerText;
            navigator.clipboard.writeText(text).then(() => {
                copyBtn.textContent = '✅ Copied!';
                setTimeout(() => { copyBtn.textContent = t('copyLogs'); }, 1500);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                copyBtn.textContent = '✅ Copied!';
                setTimeout(() => { copyBtn.textContent = t('copyLogs'); }, 1500);
            });
        });

        const clearBtn = document.createElement('button');
        clearBtn.className = 'logs-action-btn';
        clearBtn.textContent = t('clearLogs');
        clearBtn.addEventListener('click', () => {
            const lView = document.getElementById('qh-logs-view');
            if (lView) {
                lView.innerHTML = '';
                lView.textContent = t('logsEmpty');
            }
        });

        actionsRow.append(copyBtn, clearBtn);
        logsContent.appendChild(actionsRow);

        // Logs container
        const logsView = document.createElement('div');
        logsView.className = 'logs-container';
        logsView.id = 'qh-logs-view';
        logsView.textContent = t('logsEmpty');
        logsContent.appendChild(logsView);

        // Buttons
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; gap: 12px; flex-shrink: 0; margin-top: 4px;';

        startBtn = document.createElement('button');
        startBtn.className = 'btn-start';
        startBtn.textContent = t('start');
        startBtn.style.flex = '1';

        stopBtn = document.createElement('button');
        stopBtn.className = 'btn-stop';
        stopBtn.disabled = true;
        stopBtn.textContent = t('stop');
        stopBtn.style.flex = '1';

        btnContainer.append(startBtn, stopBtn);
        logsContent.appendChild(btnContainer);

        startBtn.addEventListener('click', () => {
            if (startBtn.disabled || isRunning) return;
            isRunning = true;
            startBtn.disabled = true;
            startBtn.textContent = t('running');
            stopBtn.disabled = false;
            stopBtn.style.opacity = '1';
            stopBtn.style.cursor = 'pointer';
            runQuests();
        });

        stopBtn.addEventListener('click', () => {
            if (stopFlag) stopFlag.stopped = true;
        });
    }

    // ---------- PROGRESS UI ----------
    function updateProgressUI(done, target) {
        const bar = document.getElementById('qh-progress-bar');
        const text = document.getElementById('qh-progress-text');
        if (bar) bar.style.width = (target > 0 ? Math.min(100, (done / target) * 100) : 0) + '%';
        if (text) {
            if (target === 0) { text.textContent = t('waiting'); return; }
            const remaining = Math.max(0, target - done);
            const mins = Math.floor(remaining / 60), secs = Math.floor(remaining % 60);
            text.textContent = `${Math.floor(done)} / ${target} sec (${mins}m ${secs}s left)`;
        }
    }

    // ---------- LOG FUNCTION ----------
    window.questHelperLog = (msg, isError = false) => {
        const lView = document.getElementById('qh-logs-view');
        if (!lView) return;
        if (lView.textContent === t('logsEmpty')) lView.innerHTML = '';
        const line = document.createElement('div');
        line.className = 'log-line';
        line.style.cssText = `color: ${isError ? '#f38ba8' : '#7fe08a'}; border-left: 3px solid ${isError ? '#f38ba8' : '#6ad9ff'};`;
        line.textContent = '> ' + msg;
        lView.appendChild(line);
        lView.scrollTop = lView.scrollHeight;
    };

    // ---------- DISCORD MODULES ----------
    function getDiscordModules() {
        try {
            const webpackChunk = window.webpackChunkdiscord_app;
            if (!webpackChunk) throw new Error('Webpack chunk not found');
            const fakeModule = webpackChunk.push([[Symbol()], {}, r => r]);
            webpackChunk.pop();
            const modules = Object.values(fakeModule.c);
            const find = (predicate) => modules.find(predicate)?.exports;
            return {
                ApplicationStreamingStore: find(x => x?.exports?.A?.__proto__?.getStreamerActiveStreamMetadata)?.A,
                RunningGameStore: find(x => x?.exports?.Ay?.getRunningGames)?.Ay,
                QuestsStore: find(x => x?.exports?.A?.__proto__?.getQuest)?.A,
                ChannelStore: find(x => x?.exports?.A?.__proto__?.getAllThreadsForParent)?.A,
                GuildChannelStore: find(x => x?.exports?.Ay?.getSFWDefaultChannel)?.Ay,
                FluxDispatcher: find(x => x?.exports?.h?.__proto__?.flushWaitQueue)?.h,
                api: find(x => x?.exports?.Bo?.get)?.Bo
            };
        } catch (e) { console.warn('Quest Helper: Module search failed', e); return {}; }
    }

    // ---------- HELPERS ----------
    const sleep = ms => new Promise(r => setTimeout(r, ms + Math.random() * CONFIG.JITTER_MS));
    const randomPID = () => Math.floor(Math.random() * (CONFIG.MAX_PID - CONFIG.MIN_PID + 1)) + CONFIG.MIN_PID;
    const isDesktop = () => typeof DiscordNative !== 'undefined';

    // ---------- TIMER ----------
    function createLocalTimer(targetSeconds, initialProgress) {
        let progress = initialProgress;
        let interval = null;
        const start = () => {
            if (interval) return;
            interval = setInterval(() => {
                if (stopFlag.stopped || progress >= targetSeconds) {
                    if (progress >= targetSeconds) updateProgressUI(targetSeconds, targetSeconds);
                    return;
                }
                progress = Math.min(targetSeconds, progress + 1);
                updateProgressUI(progress, targetSeconds);
            }, 1000);
        };
        const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
        const setProgress = (newProgress) => {
            progress = Math.min(targetSeconds, Math.max(0, newProgress));
            updateProgressUI(progress, targetSeconds);
        };
        const getProgress = () => progress;
        const isFinished = () => progress >= targetSeconds;
        start();
        return { start, stop, setProgress, getProgress, isFinished };
    }

    // ---------- VIDEO QUEST ----------
    async function handleVideoQuest(quest, api) {
        const { id, config, userStatus } = quest;
        const taskConfig = config.taskConfig ?? config.taskConfigV2;
        const taskName = CONFIG.SUPPORTED_TASKS.find(t => taskConfig.tasks[t] != null);
        const secondsNeeded = taskConfig.tasks[taskName].target;
        let secondsDone = userStatus?.progress?.[taskName]?.value ?? 0;

        questHelperLog(`Need ${secondsNeeded} sec`);
        const timer = createLocalTimer(secondsNeeded, secondsDone);

        const statusInterval = setInterval(async () => {
            if (stopFlag.stopped || timer.isFinished()) { clearInterval(statusInterval); return; }
            try {
                const res = await api.get({ url: `/quests/${id}` });
                if (res.body.completedAt) {
                    questHelperLog(t('questDone'));
                    timer.stop();
                    clearInterval(statusInterval);
                    return;
                }
                const progress = res.body.userStatus?.progress?.[taskName]?.value ?? 0;
                if (progress > timer.getProgress()) timer.setProgress(progress);
            } catch (e) { questHelperLog(`Check error: ${e.message}`, true); }
        }, CONFIG.STATUS_CHECK_INTERVAL);

        while (true) {
            if (stopFlag.stopped) { questHelperLog(t('stoppedUser')); timer.stop(); clearInterval(statusInterval); return; }
            const remaining = Math.min(CONFIG.VIDEO_SPEED, secondsNeeded - timer.getProgress());
            if (remaining <= 0) break;
            await new Promise(r => setTimeout(r, remaining * 1000 + Math.random() * CONFIG.JITTER_MS));
            if (stopFlag.stopped) { timer.stop(); clearInterval(statusInterval); return; }

            const newTimestamp = Math.min(secondsNeeded, timer.getProgress() + CONFIG.VIDEO_SPEED + (Math.random() * 0.5));
            try {
                const res = await api.post({ url: `/quests/${id}/video-progress`, body: { timestamp: newTimestamp } });
                const serverProgress = res.body.progress?.[taskName]?.value ?? 0;
                if (serverProgress > timer.getProgress()) timer.setProgress(serverProgress);
                if (res.body.completed_at) {
                    questHelperLog(t('questDone'));
                    timer.stop();
                    clearInterval(statusInterval);
                    return;
                }
            } catch (error) { questHelperLog(`Send error: ${error.message}`, true); }
            if (timer.isFinished()) break;
        }

        try {
            await api.post({ url: `/quests/${id}/video-progress`, body: { timestamp: secondsNeeded } });
            questHelperLog(t('questDone'));
        } catch (error) { questHelperLog(`Final error: ${error.message}`, true); }
        timer.stop();
        clearInterval(statusInterval);
    }

    // ---------- DESKTOP QUEST ----------
    async function handlePlayDesktopQuest(quest, api, RunningGameStore, FluxDispatcher) {
        if (!isDesktop()) {
            questHelperLog('❌ Desktop app only', true);
            return;
        }

        const { id, config, userStatus } = quest;
        const taskConfig = config.taskConfig ?? config.taskConfigV2;
        const taskName = 'PLAY_ON_DESKTOP';
        const taskData = taskConfig.tasks[taskName];
        const applicationId = config.application?.id ?? taskData.applications?.[0]?.id ?? taskData.applications?.[0]?.applicationId;
        const secondsNeeded = taskData.target;
        let secondsDone = userStatus?.progress?.[taskName]?.value ?? 0;

        if (!applicationId) {
            questHelperLog('❌ applicationId not found', true);
            return;
        }

        let appData;
        try {
            const res = await api.get({ url: `/applications/public?application_ids=${applicationId}` });
            appData = res.body[0];
            if (!appData) throw new Error('Application not found');
        } catch (error) {
            questHelperLog(`❌ Data fetch error: ${error.message}`, true);
            return;
        }

        const exeName = appData.executables?.find(x => x.os === 'win32')?.name?.replace('>', '') || appData.name.replace(/[\/\\:*?"<>|]/g, '');
        const fakePid = randomPID();

        const fakeGame = {
            cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
            exeName,
            exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
            hidden: false,
            isLauncher: false,
            id: applicationId,
            name: appData.name,
            pid: fakePid,
            pidPath: [fakePid],
            processName: appData.name,
            start: Date.now() - Math.floor(Math.random() * 10000),
        };

        const origGetRunningGames = RunningGameStore.getRunningGames;
        const origGetGameForPID = RunningGameStore.getGameForPID;

        RunningGameStore.getRunningGames = () => [fakeGame];
        RunningGameStore.getGameForPID = (pid) => (pid === fakePid ? fakeGame : null);

        FluxDispatcher.dispatch({
            type: 'RUNNING_GAMES_CHANGE',
            removed: [],
            added: [fakeGame],
            games: [fakeGame]
        });

        questHelperLog(`Spoofing: "${appData.name}". ~${Math.ceil((secondsNeeded - secondsDone) / 60)} min left.`);
        const timer = createLocalTimer(secondsNeeded, secondsDone);

        const cleanup = () => {
            RunningGameStore.getRunningGames = origGetRunningGames;
            RunningGameStore.getGameForPID = origGetGameForPID;
            FluxDispatcher.dispatch({
                type: 'RUNNING_GAMES_CHANGE',
                removed: [fakeGame],
                added: [],
                games: []
            });
            timer.stop();
        };

        const statusInterval = setInterval(async () => {
            if (stopFlag.stopped || timer.isFinished()) {
                clearInterval(statusInterval);
                if (timer.isFinished()) cleanup();
                return;
            }
            try {
                const res = await api.get({ url: `/quests/${id}` });
                if (res.body.completedAt) {
                    questHelperLog(t('questDone'));
                    cleanup();
                    clearInterval(statusInterval);
                    return;
                }
                const progress = res.body.userStatus?.progress?.[taskName]?.value ?? 0;
                if (progress > timer.getProgress()) timer.setProgress(progress);
            } catch (e) { questHelperLog(`Check error: ${e.message}`, true); }
        }, CONFIG.STATUS_CHECK_INTERVAL);

        return new Promise((resolve) => {
            const handler = (data) => {
                if (stopFlag.stopped) {
                    cleanup();
                    FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);
                    clearInterval(statusInterval);
                    resolve();
                    return;
                }
                const progress = config.configVersion === 1
                    ? data.userStatus.streamProgressSeconds
                    : Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);
                if (progress > timer.getProgress()) timer.setProgress(progress);

                if (timer.isFinished()) {
                    questHelperLog(t('questDone'));
                    cleanup();
                    FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);
                    clearInterval(statusInterval);
                    resolve();
                }
            };
            FluxDispatcher.subscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);
        });
    }

    // ---------- MAIN PROCESS ----------
    async function runQuests() {
        const modules = getDiscordModules();
        const { QuestsStore, api, RunningGameStore, FluxDispatcher } = modules;

        if (!QuestsStore || !api) {
            questHelperLog(t('noModules'), true);
            resetButtons();
            return;
        }

        const now = Date.now();
        const quests = [...QuestsStore.quests.values()].filter(q => {
            const enrolled = q.userStatus?.enrolledAt;
            const completed = q.userStatus?.completedAt;
            const expires = new Date(q.config.expiresAt).getTime();
            const hasSupported = CONFIG.SUPPORTED_TASKS.some(t => (q.config.taskConfig ?? q.config.taskConfigV2).tasks?.[t] != null);
            return enrolled && !completed && expires > now && hasSupported;
        });

        if (quests.length === 0) {
            questHelperLog(t('noQuests'));
            resetButtons();
            return;
        }

        questHelperLog(t('foundQuests', quests.length));

        stopFlag = { stopped: false };

        for (const quest of quests) {
            if (stopFlag.stopped) { questHelperLog(t('stoppedUser')); break; }
            const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
            const taskName = CONFIG.SUPPORTED_TASKS.find(t => taskConfig.tasks[t] != null);
            const questName = quest.config.messages.questName;

            questHelperLog(`\n=== ${questName} (${taskName}) ===`);

            try {
                if (taskName === 'WATCH_VIDEO' || taskName === 'WATCH_VIDEO_ON_MOBILE') {
                    await handleVideoQuest(quest, api);
                } else if (taskName === 'PLAY_ON_DESKTOP') {
                    await handlePlayDesktopQuest(quest, api, RunningGameStore, FluxDispatcher);
                } else {
                    questHelperLog(t('notImplemented', taskName), true);
                }
            } catch (e) {
                questHelperLog(t('error', e.message), true);
            }
            if (stopFlag.stopped) break;
        }

        questHelperLog(stopFlag.stopped ? t('stoppedUser') : '✅ All done');
        resetButtons();
    }

    function resetButtons() {
        isRunning = false;
        startBtn.disabled = false;
        startBtn.textContent = t('start');
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.6';
        stopBtn.style.cursor = 'not-allowed';
        stopFlag = null;
    }

    // ---------- TAB SWITCH ----------
    const switchTab = (tabName) => {
        if (tabName === 'info') {
            tabInfo.classList.add('active');
            tabLogs.classList.remove('active');
            infoContent.classList.add('visible');
            logsContent.classList.remove('visible');
        } else {
            tabLogs.classList.add('active');
            tabInfo.classList.remove('active');
            logsContent.classList.add('visible');
            infoContent.classList.remove('visible');
        }
    };

    // ---------- UPDATE LANGUAGE ----------
    const updateLanguage = () => {
        document.getElementById('qh-title').textContent = t('title');
        tabInfo.textContent = t('tabInfo');
        tabLogs.textContent = t('tabLogs');
        langBtn.textContent = t('langBtn');
        collapseBtn.textContent = t('minimize');
        if (startBtn) startBtn.textContent = isRunning ? t('running') : t('start');
        if (stopBtn) stopBtn.textContent = t('stop');

        renderInfoContent();

        const pText = document.getElementById('qh-progress-text');
        if (pText && (pText.textContent === 'Ожидание...' || pText.textContent === 'Waiting...')) {
            pText.textContent = t('waiting');
        }

        const lView = document.getElementById('qh-logs-view');
        if (lView && lView.children.length === 0) lView.textContent = t('logsEmpty');
    };

    // ---------- COLLAPSE ----------
    let collapsed = false;
    collapseBtn.addEventListener('click', () => {
        collapsed = !collapsed;
        if (collapsed) {
            body.classList.add('minimized');
            langBtn.style.display = 'none';
            resizeHandle.style.display = 'none';
            root.style.minHeight = HEADER_HEIGHT + 'px';
            root.style.height = HEADER_HEIGHT + 'px';
        } else {
            body.classList.remove('minimized');
            langBtn.style.display = 'block';
            resizeHandle.style.display = 'block';
            root.style.minHeight = MIN_HEIGHT + 'px';
            root.style.height = '';
        }
        collapseBtn.style.transform = collapsed ? 'rotate(180deg)' : 'rotate(0deg)';
    });

    // ---------- CLOSE ----------
    closeBtn.addEventListener('click', () => {
        if (stopFlag) stopFlag.stopped = true;
        window.dispatchEvent(new CustomEvent('questHelper:closed'));
        root.remove();
        style.remove();
    });

    // ---------- LANGUAGE ----------
    langBtn.addEventListener('click', () => {
        saveLanguage(LANG === 'en' ? 'ru' : 'en');
        updateLanguage();
    });

    // ---------- TABS ----------
    tabInfo.addEventListener('click', () => switchTab('info'));
    tabLogs.addEventListener('click', () => switchTab('logs'));

    // ---------- DRAG ----------
    let isDragging = false, offsetX = 0, offsetY = 0;
    dragHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = root.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        root.style.left = (e.clientX - offsetX) + 'px';
        root.style.top = (e.clientY - offsetY) + 'px';
        root.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { isDragging = false; });

    // ---------- RESIZE ----------
    let isResizing = false, startX = 0, startY = 0, startWidth = 0, startHeight = 0;
    resizeHandle.addEventListener('mousedown', (e) => {
        if (collapsed) return;
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = root.offsetWidth;
        startHeight = root.offsetHeight;
        e.preventDefault();
        e.stopPropagation();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = Math.max(MIN_WIDTH, startWidth + (e.clientX - startX));
        const newHeight = Math.max(MIN_HEIGHT, startHeight + (e.clientY - startY));
        root.style.width = newWidth + 'px';
        root.style.height = newHeight + 'px';
    });
    document.addEventListener('mouseup', () => { isResizing = false; });

    // ---------- INIT ----------
    renderInfoContent();
    renderLogsContent();
    updateLanguage();

    console.log('Quest Helper: Loaded.');

    window.addEventListener('questHelper:closed', () => {
        console.log('Quest Helper: Closed.');
    });
})();
