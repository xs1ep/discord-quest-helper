// ================================================================
// ПОЛНАЯ ВЕРСИЯ: Quest Helper — унифицированный статус-чекер + улучшенный UI
// ================================================================

(function() {
    'use strict';

    // ---------- КОНФИГ ----------
    const CONFIG = {
        VIDEO_SPEED: 7,
        HEARTBEAT_INTERVAL: 20 * 1000,
        STATUS_CHECK_INTERVAL: 30 * 1000,
        MIN_PID: 1000,
        MAX_PID: 65535,
        JITTER_MS: 2500,
        SUPPORTED_TASKS: [
            'WATCH_VIDEO',
            'PLAY_ON_DESKTOP',
            'STREAM_ON_DESKTOP',
            'PLAY_ACTIVITY',
            'WATCH_VIDEO_ON_MOBILE'
        ]
    };

    // ---------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ----------
    const sleep = ms => new Promise(r => setTimeout(r, ms + Math.random() * CONFIG.JITTER_MS));
    const randomPID = () => Math.floor(Math.random() * (CONFIG.MAX_PID - CONFIG.MIN_PID + 1)) + CONFIG.MIN_PID;
    const isDesktop = () => typeof DiscordNative !== 'undefined';

    // ---------- ПОИСК МОДУЛЕЙ DISCORD ----------
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
        } catch (e) {
            console.warn('Quest Helper: Ошибка поиска модулей', e);
            return {};
        }
    }

    // ---------- ЛОКАЛЬНЫЙ ТАЙМЕР ----------
    function createLocalTimer(ui, targetSeconds, initialProgress, stopFlag) {
        let progress = initialProgress;
        let interval = null;

        const start = () => {
            if (interval) return;
            interval = setInterval(() => {
                if (stopFlag.stopped || progress >= targetSeconds) {
                    if (progress >= targetSeconds) ui.updateProgress(targetSeconds, targetSeconds);
                    return;
                }
                progress = Math.min(targetSeconds, progress + 1);
                ui.updateProgress(progress, targetSeconds);
            }, 1000);
        };

        const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
        const setProgress = (newProgress) => {
            progress = Math.min(targetSeconds, Math.max(0, newProgress));
            ui.updateProgress(progress, targetSeconds);
        };
        const getProgress = () => progress;
        const isFinished = () => progress >= targetSeconds;

        start();
        return { start, stop, setProgress, getProgress, isFinished };
    }

    // ---------- УНИВЕРСАЛЬНЫЙ СТАТУС-ЧЕКЕР (убирает дублирование) ----------
    function startStatusChecker(quest, api, taskName, timer, ui, stopFlag, opts = {}) {
        const { id } = quest;
        const { onCompleted, onProgressUpdate } = opts;

        const checkStatus = async () => {
            try {
                const res = await api.get({ url: `/quests/${id}` });
                if (res.body.completedAt) {
                    ui.log('✅ Квест завершён (проверка статуса)');
                    onCompleted && onCompleted();
                    return true;
                }
                const progress = res.body.userStatus?.progress?.[taskName]?.value ?? 0;
                if (progress > timer.getProgress()) {
                    timer.setProgress(progress);
                    onProgressUpdate && onProgressUpdate(progress);
                }
                return false;
            } catch (e) {
                ui.log(`⚠️ Ошибка проверки: ${e.message}`, true);
                return false;
            }
        };

        const interval = setInterval(async () => {
            if (stopFlag.stopped || timer.isFinished()) {
                clearInterval(interval);
                return;
            }
            const completed = await checkStatus();
            if (completed) {
                clearInterval(interval);
            }
        }, CONFIG.STATUS_CHECK_INTERVAL);

        return { interval, checkStatus };
    }

    // ---------- ОБРАБОТЧИКИ КВЕСТОВ ----------

    async function handleVideoQuest(quest, api, ui, stopFlag) {
        const { id, config, userStatus } = quest;
        const taskConfig = config.taskConfig ?? config.taskConfigV2;
        const taskName = CONFIG.SUPPORTED_TASKS.find(t => taskConfig.tasks[t] != null);
        const secondsNeeded = taskConfig.tasks[taskName].target;
        let secondsDone = userStatus?.progress?.[taskName]?.value ?? 0;

        ui.log(`Нужно набрать ${secondsNeeded} сек.`);
        const timer = createLocalTimer(ui, secondsNeeded, secondsDone, stopFlag);

        const { interval: statusInterval } = startStatusChecker(quest, api, taskName, timer, ui, stopFlag, {
            onCompleted: () => {
                timer.stop();
                ui.updateProgress(secondsNeeded, secondsNeeded);
                ui.resetProgress();
            }
        });

        while (true) {
            if (stopFlag.stopped) {
                ui.log('⏹ Остановлено пользователем.');
                timer.stop();
                clearInterval(statusInterval);
                ui.resetProgress();
                return;
            }
            const remaining = Math.min(CONFIG.VIDEO_SPEED, secondsNeeded - timer.getProgress());
            if (remaining <= 0) break;

            await sleep(remaining * 1000);

            if (stopFlag.stopped) {
                timer.stop();
                clearInterval(statusInterval);
                ui.resetProgress();
                return;
            }

            const newTimestamp = Math.min(secondsNeeded, timer.getProgress() + CONFIG.VIDEO_SPEED + (Math.random() * 0.5));
            try {
                const res = await api.post({
                    url: `/quests/${id}/video-progress`,
                    body: { timestamp: newTimestamp }
                });
                const serverProgress = res.body.progress?.[taskName]?.value ?? 0;
                if (serverProgress > timer.getProgress()) timer.setProgress(serverProgress);

                if (res.body.completed_at) {
                    ui.log('✅ Квест завершён!');
                    timer.setProgress(secondsNeeded);
                    timer.stop();
                    clearInterval(statusInterval);
                    ui.resetProgress();
                    return;
                }
            } catch (error) {
                ui.log(`️ Ошибка отправки: ${error.message}`, true);
            }
            if (timer.isFinished()) break;
        }

        try {
            await api.post({ url: `/quests/${id}/video-progress`, body: { timestamp: secondsNeeded } });
            ui.log('✅ Квест завершён (финал)');
            timer.setProgress(secondsNeeded);
        } catch (error) {
            ui.log(`❌ Финальная ошибка: ${error.message}`, true);
        }
        timer.stop();
        clearInterval(statusInterval);
        ui.resetProgress();
    }

    async function handlePlayDesktopQuest(quest, api, RunningGameStore, FluxDispatcher, ui, stopFlag) {
        if (!isDesktop()) {
            ui.log('❌ Только для десктопного приложения.', true);
            return;
        }

        const { id, config, userStatus } = quest;
        const taskConfig = config.taskConfig ?? config.taskConfigV2;
        const taskName = 'PLAY_ON_DESKTOP';
        const taskData = taskConfig.tasks[taskName];
        // Унифицировано: фоллбэк на оба варианта поля
        const applicationId = config.application?.id
            ?? taskData.applications?.[0]?.id
            ?? taskData.applications?.[0]?.applicationId;
        const secondsNeeded = taskData.target;
        let secondsDone = userStatus?.progress?.[taskName]?.value ?? 0;

        if (!applicationId) {
            ui.log('❌ Не найден applicationId', true);
            return;
        }

        let appData;
        try {
            const res = await api.get({ url: `/applications/public?application_ids=${applicationId}` });
            appData = res.body[0];
            if (!appData) throw new Error('Приложение не найдено');
        } catch (error) {
            ui.log(`❌ Ошибка получения данных: ${error.message}`, true);
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

        const originalGetRunningGames = RunningGameStore.getRunningGames;
        const originalGetGameForPID = RunningGameStore.getGameForPID;

        RunningGameStore.getRunningGames = () => [fakeGame];
        RunningGameStore.getGameForPID = (pid) => (pid === fakePid ? fakeGame : null);

        FluxDispatcher.dispatch({
            type: 'RUNNING_GAMES_CHANGE',
            removed: [],
            added: [fakeGame],
            games: [fakeGame]
        });

        ui.log(`Подмена: "${appData.name}". Осталось ~${Math.ceil((secondsNeeded - secondsDone) / 60)} мин.`);
        const timer = createLocalTimer(ui, secondsNeeded, secondsDone, stopFlag);

        const cleanup = () => {
            RunningGameStore.getRunningGames = originalGetRunningGames;
            RunningGameStore.getGameForPID = originalGetGameForPID;
            FluxDispatcher.dispatch({ type: 'RUNNING_GAMES_CHANGE', removed: [fakeGame], added: [], games: [] });
            timer.stop();
            ui.resetProgress();
        };

        const { interval: statusInterval } = startStatusChecker(quest, api, taskName, timer, ui, stopFlag, {
            onCompleted: cleanup
        });

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
                    ui.log('✅ Квест завершён!');
                    cleanup();
                    FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);
                    clearInterval(statusInterval);
                    resolve();
                }
            };
            FluxDispatcher.subscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);

            const fallbackInterval = setInterval(async () => {
                if (stopFlag.stopped || timer.isFinished()) {
                    clearInterval(fallbackInterval);
                    if (timer.isFinished()) {
                        cleanup();
                        FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);
                        clearInterval(statusInterval);
                        resolve();
                    }
                    return;
                }
                const { checkStatus } = startStatusChecker(quest, api, taskName, timer, ui, stopFlag, {
                    onCompleted: () => {
                        cleanup();
                        FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);
                        clearInterval(statusInterval);
                        clearInterval(fallbackInterval);
                        resolve();
                    }
                });
                const completed = await checkStatus();
                if (completed) {
                    cleanup();
                    FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);
                    clearInterval(statusInterval);
                    clearInterval(fallbackInterval);
                    resolve();
                }
            }, CONFIG.STATUS_CHECK_INTERVAL);
        });
    }

    async function handleStreamDesktopQuest(quest, api, ApplicationStreamingStore, FluxDispatcher, ui, stopFlag) {
        if (!isDesktop()) {
            ui.log('❌ Только для десктопного приложения.', true);
            return;
        }

        const { id, config, userStatus } = quest;
        const taskConfig = config.taskConfig ?? config.taskConfigV2;
        const taskName = 'STREAM_ON_DESKTOP';
        const taskData = taskConfig.tasks[taskName];
        // Унифицировано: фоллбэк на оба варианта поля
        const applicationId = config.application?.id
            ?? taskData.applications?.[0]?.id
            ?? taskData.applications?.[0]?.applicationId;
        const secondsNeeded = taskData.target;
        let secondsDone = userStatus?.progress?.[taskName]?.value ?? 0;

        if (!applicationId) {
            ui.log('❌ Не найден applicationId', true);
            return;
        }

        const originalGetMetadata = ApplicationStreamingStore.getStreamerActiveStreamMetadata;
        ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
            id: applicationId,
            pid: randomPID(),
            sourceName: null
        });

        ui.log(`Подмена стрима. Осталось ~${Math.ceil((secondsNeeded - secondsDone) / 60)} мин.`);
        ui.log('⚠️ Требуется реальный стрим в голосовом канале с хотя бы одним зрителем.');
        const timer = createLocalTimer(ui, secondsNeeded, secondsDone, stopFlag);

        const cleanup = () => {
            ApplicationStreamingStore.getStreamerActiveStreamMetadata = originalGetMetadata;
            timer.stop();
            ui.resetProgress();
        };

        const { interval: statusInterval } = startStatusChecker(quest, api, taskName, timer, ui, stopFlag, {
            onCompleted: cleanup
        });

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
                    : Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);
                if (progress > timer.getProgress()) timer.setProgress(progress);

                if (timer.isFinished()) {
                    ui.log('✅ Квест завершён!');
                    cleanup();
                    FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);
                    clearInterval(statusInterval);
                    resolve();
                }
            };
            FluxDispatcher.subscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);

            const fallbackInterval = setInterval(async () => {
                if (stopFlag.stopped || timer.isFinished()) {
                    clearInterval(fallbackInterval);
                    if (timer.isFinished()) {
                        cleanup();
                        FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);
                        clearInterval(statusInterval);
                        resolve();
                    }
                    return;
                }
                const { checkStatus } = startStatusChecker(quest, api, taskName, timer, ui, stopFlag, {
                    onCompleted: () => {
                        cleanup();
                        FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);
                        clearInterval(statusInterval);
                        clearInterval(fallbackInterval);
                        resolve();
                    }
                });
                const completed = await checkStatus();
                if (completed) {
                    cleanup();
                    FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', handler);
                    clearInterval(statusInterval);
                    clearInterval(fallbackInterval);
                    resolve();
                }
            }, CONFIG.STATUS_CHECK_INTERVAL);
        });
    }

    async function handlePlayActivityQuest(quest, api, ChannelStore, GuildChannelStore, ui, stopFlag) {
        const { id, config, userStatus } = quest;
        const taskConfig = config.taskConfig ?? config.taskConfigV2;
        const taskName = 'PLAY_ACTIVITY';
        const secondsNeeded = taskConfig.tasks[taskName].target;
        let secondsDone = userStatus?.progress?.[taskName]?.value ?? 0;

        let channelId = ChannelStore.getSortedPrivateChannels()[0]?.id;
        if (!channelId) {
            const guilds = GuildChannelStore.getAllGuilds();
            for (const guildId in guilds) {
                const vocalChannels = guilds[guildId]?.VOCAL;
                if (vocalChannels && vocalChannels.length > 0) {
                    channelId = vocalChannels[0].channel.id;
                    break;
                }
            }
        }
        if (!channelId) {
            ui.log('❌ Не найден голосовой канал.', true);
            return;
        }

        const streamKey = `call:${channelId}:1`;
        ui.log(`Выбран канал ${channelId}`);
        const timer = createLocalTimer(ui, secondsNeeded, secondsDone, stopFlag);

        const { interval: statusInterval } = startStatusChecker(quest, api, taskName, timer, ui, stopFlag, {
            onCompleted: () => {
                timer.stop();
                ui.resetProgress();
            }
        });

        while (true) {
            if (stopFlag.stopped) {
                ui.log('⏹ Остановлено пользователем.');
                timer.stop();
                clearInterval(statusInterval);
                ui.resetProgress();
                return;
            }
            try {
                const res = await api.post({
                    url: `/quests/${id}/heartbeat`,
                    body: { stream_key: streamKey, terminal: false }
                });
                const progress = res.body.progress?.PLAY_ACTIVITY?.value ?? 0;
                if (progress > timer.getProgress()) timer.setProgress(progress);

                if (timer.isFinished()) {
                    await api.post({ url: `/quests/${id}/heartbeat`, body: { stream_key: streamKey, terminal: true } });
                    ui.log('✅ Квест завершён!');
                    timer.stop();
                    clearInterval(statusInterval);
                    ui.resetProgress();
                    break;
                }
            } catch (error) {
                ui.log(`⚠️ Ошибка heartbeat: ${error.message}`, true);
            }
            await sleep(CONFIG.HEARTBEAT_INTERVAL);

            if (stopFlag.stopped) {
                ui.log('⏹ Остановлено пользователем.');
                timer.stop();
                clearInterval(statusInterval);
                ui.resetProgress();
                return;
            }
        }
    }

    // ---------- СОЗДАНИЕ ПАНЕЛИ ----------
    function createQuestPanel() {
        const oldPanel = document.getElementById('quest-panel');
        if (oldPanel) oldPanel.remove();

        const oldStyles = document.querySelectorAll('style[data-quest-helper]');
        oldStyles.forEach(s => s.remove());

        const globalStyle = document.createElement('style');
        globalStyle.setAttribute('data-quest-helper', 'true');
        globalStyle.textContent = `
            @keyframes quest-shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            #quest-log::-webkit-scrollbar { width: 8px; }
            #quest-log::-webkit-scrollbar-track { background: #1e1e2e; border-radius: 4px; }
            #quest-log::-webkit-scrollbar-thumb { background: #585b70; border-radius: 4px; }
            #quest-log::-webkit-scrollbar-thumb:hover { background: #6c7086; }
            #quest-panel-close {
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                border-radius: 6px;
            }
            #quest-panel-close:hover {
                transform: rotate(90deg);
                background: rgba(243, 139, 168, 0.2);
            }
            .quest-btn-start:not(:disabled):hover {
                transform: translateY(-2px) !important;
                box-shadow: 0 6px 16px rgba(137, 180, 250, 0.4) !important;
            }
            .quest-btn-stop:not(:disabled):hover {
                transform: translateY(-2px) !important;
                box-shadow: 0 6px 16px rgba(243, 139, 168, 0.4) !important;
            }
            .quest-btn-start:disabled, .quest-btn-stop:disabled {
                opacity: 0.5;
                cursor: not-allowed !important;
                transform: none !important;
            }
        `;
        document.head.appendChild(globalStyle);

        const panel = document.createElement('div');
        panel.id = 'quest-panel';
        panel.style.cssText = `
            position: fixed;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            width: 400px;
            min-width: 300px;
            min-height: 400px;
            max-height: 90vh;
            background: rgba(30, 30, 46, 0.98);
            color: #cdd6f4;
            border: 1px solid #585b70;
            border-radius: 16px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            font-size: 14px;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            cursor: default;
        `;
        panel.ondragstart = () => false;

        const header = document.createElement('div');
        header.id = 'quest-panel-header';
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 700;
            font-size: 15px;
            color: #cba6f7;
            background: linear-gradient(135deg, rgba(180, 190, 254, 0.1), rgba(203, 166, 247, 0.1));
            border-bottom: 1px solid #45475a;
            padding: 14px 16px;
            cursor: grab;
            user-select: none;
            backdrop-filter: blur(10px);
        `;
        header.innerHTML = `
            <span style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">🎮</span>
                <span>Quest Helper</span>
            </span>
            <span id="quest-panel-close" style="cursor: pointer; font-size: 20px; color: #f38ba8; padding: 0 4px;">✕</span>
        `;
        panel.appendChild(header);

        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `padding: 12px 16px 8px; background: rgba(17, 17, 27, 0.3);`;

        const progressWrapper = document.createElement('div');
        progressWrapper.style.cssText = `
            background: #1e1e2e;
            border-radius: 10px;
            height: 24px;
            overflow: hidden;
            position: relative;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3) inset;
            border: 1px solid #313244;
        `;

        const progressBar = document.createElement('div');
        progressBar.id = 'quest-progress-bar';
        progressBar.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #89b4fa 0%, #cba6f7 50%, #f5c2e7 100%);
            transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        `;

        const shimmer = document.createElement('div');
        shimmer.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%);
            animation: quest-shimmer 2s infinite;
        `;
        progressBar.appendChild(shimmer);
        progressWrapper.appendChild(progressBar);
        progressContainer.appendChild(progressWrapper);
        panel.appendChild(progressContainer);

        const progressText = document.createElement('div');
        progressText.id = 'quest-progress-text';
        progressText.style.cssText = `
            text-align: center;
            font-size: 13px;
            color: #a6e3a1;
            margin-top: 8px;
            font-weight: 600;
            text-shadow: 0 1px 3px rgba(0,0,0,0.5);
            letter-spacing: 0.3px;
        `;
        progressText.textContent = 'Ожидание...';
        panel.appendChild(progressText);

        const logContainer = document.createElement('div');
        logContainer.id = 'quest-log';
        logContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            background: #11111b;
            margin: 8px 12px;
            border-radius: 10px;
            padding: 12px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
            min-height: 120px;
            border: 1px solid #313244;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3) inset;
            cursor: default;
        `;
        panel.appendChild(logContainer);

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = `display: flex; gap: 12px; padding: 0 16px 16px;`;

        const startBtn = document.createElement('button');
        startBtn.className = 'quest-btn-start';
        startBtn.textContent = '▶ Запустить';
        startBtn.style.cssText = `
            flex: 1;
            background: linear-gradient(135deg, #89b4fa, #74c7ec);
            color: #11111b;
            border: none;
            border-radius: 10px;
            padding: 12px 0;
            font-weight: 700;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(137, 180, 250, 0.3);
            text-shadow: 0 1px 2px rgba(255,255,255,0.3);
        `;

        const stopBtn = document.createElement('button');
        stopBtn.className = 'quest-btn-stop';
        stopBtn.textContent = '⏹ Остановить';
        stopBtn.disabled = true;
        stopBtn.style.cssText = `
            flex: 1;
            background: linear-gradient(135deg, #f38ba8, #f5a0b5);
            color: #11111b;
            border: none;
            border-radius: 10px;
            padding: 12px 0;
            font-weight: 700;
            font-size: 14px;
            cursor: not-allowed;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(243, 139, 168, 0.3);
            text-shadow: 0 1px 2px rgba(255,255,255,0.3);
            opacity: 0.5;
        `;

        btnContainer.append(startBtn, stopBtn);
        panel.appendChild(btnContainer);

        const resizeHandle = document.createElement('div');
        resizeHandle.id = 'quest-resize-handle';
        resizeHandle.style.cssText = `
            position: absolute;
            bottom: 0;
            right: 0;
            width: 20px;
            height: 20px;
            cursor: nwse-resize;
            background: linear-gradient(135deg, transparent 50%, rgba(203, 166, 247, 0.3) 50%);
            border-bottom-right-radius: 16px;
            z-index: 10;
            transition: background 0.2s;
        `;
        resizeHandle.onmouseover = () => {
            resizeHandle.style.background = 'linear-gradient(135deg, transparent 50%, rgba(203, 166, 247, 0.6) 50%)';
        };
        resizeHandle.onmouseout = () => {
            resizeHandle.style.background = 'linear-gradient(135deg, transparent 50%, rgba(203, 166, 247, 0.3) 50%)';
        };
        panel.appendChild(resizeHandle);

        document.body.appendChild(panel);

        // ----- Перетаскивание за заголовок -----
        let isDragging = false;
        let offsetX, offsetY;

        const onMouseDown = (e) => {
            const headerEl = document.getElementById('quest-panel-header');
            if (!headerEl || !headerEl.contains(e.target) || e.target.closest('#quest-panel-close')) return;
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            panel.style.cursor = 'grabbing';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            let left = e.clientX - offsetX;
            let top = e.clientY - offsetY;
            left = Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth));
            top = Math.max(0, Math.min(top, window.innerHeight - panel.offsetHeight));
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
            panel.style.transform = 'none';
        };

        const onMouseUp = () => {
            isDragging = false;
            panel.style.cursor = 'default';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        panel.addEventListener('mousedown', onMouseDown);

        // ----- Изменение размера за угол -----
        let isResizing = false;
        let startX, startY, startWidth, startHeight, startLeft, startTop;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = panel.offsetWidth;
            startHeight = panel.offsetHeight;
            startLeft = panel.offsetLeft;
            startTop = panel.offsetTop;
            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeUp);
            e.preventDefault();
            e.stopPropagation();
        });

        const onResizeMove = (e) => {
            if (!isResizing) return;
            const newWidth = Math.max(300, startWidth + (e.clientX - startX));
            const newHeight = Math.max(400, startHeight + (e.clientY - startY));

            panel.style.width = newWidth + 'px';
            panel.style.height = newHeight + 'px';

            const maxLeft = window.innerWidth - newWidth;
            const maxTop = window.innerHeight - newHeight;
            panel.style.left = Math.max(0, Math.min(startLeft, maxLeft)) + 'px';
            panel.style.top = Math.max(0, Math.min(startTop, maxTop)) + 'px';
            panel.style.transform = 'none';
        };

        const onResizeUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', onResizeMove);
            document.removeEventListener('mouseup', onResizeUp);
        };

        document.getElementById('quest-panel-close').addEventListener('click', () => {
            const styles = document.querySelectorAll('style[data-quest-helper]');
            styles.forEach(s => s.remove());
            panel.remove();
        });

        // UI-функции
        let currentProgress = 0;
        let currentTarget = 0;
        let progressInterval = null;

        function updateProgress(done, target) {
            currentProgress = done;
            currentTarget = target;
            const percent = target > 0 ? Math.min(100, (done / target) * 100) : 0;
            document.getElementById('quest-progress-bar').style.width = percent + '%';
            updateProgressText();
        }

        function updateProgressText() {
            const el = document.getElementById('quest-progress-text');
            if (!el) return;
            if (currentTarget === 0) {
                el.textContent = 'Ожидание...';
                return;
            }
            const remaining = Math.max(0, currentTarget - currentProgress);
            const mins = Math.floor(remaining / 60);
            const secs = Math.floor(remaining % 60);
            const pct = Math.min(100, (currentProgress / currentTarget) * 100);
            el.textContent = `${Math.floor(currentProgress)} / ${currentTarget} сек  (осталось ${mins}м ${secs}с)  [${pct.toFixed(1)}%]`;
        }

        function startProgressUpdater() {
            if (progressInterval) clearInterval(progressInterval);
            progressInterval = setInterval(updateProgressText, 1000);
        }

        function resetProgress() {
            currentProgress = 0;
            currentTarget = 0;
            document.getElementById('quest-progress-bar').style.width = '0%';
            document.getElementById('quest-progress-text').textContent = 'Готово';
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
        }

        function logMessage(msg, isError = false) {
            const log = document.getElementById('quest-log');
            if (!log) return;
            const line = document.createElement('div');
            line.style.cssText = `
                color: ${isError ? '#f38ba8' : '#a6e3a1'};
                padding: 2px 0 2px 8px;
                border-left: 3px solid ${isError ? '#f38ba8' : '#89b4fa'};
                margin: 4px 0;
                background: ${isError ? 'rgba(243, 139, 168, 0.1)' : 'rgba(166, 227, 161, 0.05)'};
                border-radius: 4px;
            `;
            line.textContent = `> ${msg}`;
            log.appendChild(line);
            log.scrollTop = log.scrollHeight;
        }

        startProgressUpdater();

        return {
            log: logMessage,
            updateProgress: updateProgress,
            resetProgress: resetProgress,
            startBtn: startBtn,
            stopBtn: stopBtn,
            panel: panel
        };
    }

    // ---------- ГЛАВНЫЙ ПРОЦЕСС ----------
    async function runQuests(modules, ui) {
        const { QuestsStore, api, RunningGameStore, FluxDispatcher, ApplicationStreamingStore, ChannelStore, GuildChannelStore } = modules;

        if (!QuestsStore || !api) {
            ui.log('❌ Не удалось найти модули Discord.', true);
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
            ui.log('Нет активных незавершённых квестов.');
            return;
        }

        ui.log(`Найдено ${quests.length} квестов. Начинаем...`);

        // Включаем stopBtn при запуске
        ui.stopBtn.disabled = false;
        ui.stopBtn.style.opacity = '1';
        ui.stopBtn.style.cursor = 'pointer';

        const stopFlag = { stopped: false };
        ui.stopBtn.onclick = () => { stopFlag.stopped = true; };

        for (const quest of quests) {
            if (stopFlag.stopped) { ui.log('⏹ Остановлено пользователем.'); break; }
            const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
            const taskName = CONFIG.SUPPORTED_TASKS.find(t => taskConfig.tasks[t] != null);
            const questName = quest.config.messages.questName;

            ui.log(`\n=== ${questName} (${taskName}) ===`);
            const questUI = { log: ui.log, updateProgress: ui.updateProgress, resetProgress: ui.resetProgress };

            try {
                switch (taskName) {
                    case 'WATCH_VIDEO': case 'WATCH_VIDEO_ON_MOBILE':
                        await handleVideoQuest(quest, api, questUI, stopFlag); break;
                    case 'PLAY_ON_DESKTOP':
                        await handlePlayDesktopQuest(quest, api, RunningGameStore, FluxDispatcher, questUI, stopFlag); break;
                    case 'STREAM_ON_DESKTOP':
                        await handleStreamDesktopQuest(quest, api, ApplicationStreamingStore, FluxDispatcher, questUI, stopFlag); break;
                    case 'PLAY_ACTIVITY':
                        await handlePlayActivityQuest(quest, api, ChannelStore, GuildChannelStore, questUI, stopFlag); break;
                    default:
                        questUI.log(`Неизвестный тип: ${taskName}`, true);
                }
            } catch (e) {
                questUI.log(`❌ Ошибка: ${e.message}`, true);
            }
            if (stopFlag.stopped) break;
        }

        ui.log(stopFlag.stopped ? '⏹ Выполнение прервано.' : '✅ Все квесты обработаны.');

        // Возвращаем UI в исходное состояние
        ui.startBtn.disabled = false;
        ui.startBtn.textContent = '▶ Запустить';
        ui.stopBtn.disabled = true;
        ui.stopBtn.style.opacity = '0.5';
        ui.stopBtn.style.cursor = 'not-allowed';
        ui.stopBtn.onclick = null;
        ui.resetProgress();
    }

    // ---------- ИНИЦИАЛИЗАЦИЯ ----------
    const modules = getDiscordModules();
    const panel = createQuestPanel();
    panel.log('Панель загружена. Нажмите "Запустить".');

    panel.startBtn.onclick = () => {
        if (panel.startBtn.disabled) return;
        panel.startBtn.disabled = true;
        panel.startBtn.textContent = '⏳ Выполняется...';
        runQuests(modules, panel).finally(() => {
            if (!panel.startBtn.disabled) return;
            panel.startBtn.disabled = false;
            panel.startBtn.textContent = '▶ Запустить';
        });
    };
})();
