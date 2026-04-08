export type UiLanguage = 'zh' | 'en'

type UiTextParams = Record<string, number | string>
type UiTextValue = string | ((params: UiTextParams) => string)

const UI_TEXT = {
  'app.searchThreads': {
    zh: '搜索会话',
    en: 'Search threads',
  },
  'app.filterThreads': {
    zh: '筛选会话...',
    en: 'Filter threads...',
  },
  'app.clearSearch': {
    zh: '清空搜索',
    en: 'Clear search',
  },
  'app.newThread': {
    zh: '新会话',
    en: 'New thread',
  },
  'app.chooseThread': {
    zh: '选择一个会话',
    en: 'Choose a thread',
  },
  'app.autoRefreshIn': {
    zh: ({ seconds }) => `${String(seconds)} 秒后自动刷新`,
    en: ({ seconds }) => `Auto refresh in ${String(seconds)}s`,
  },
  'app.enableAutoRefresh': {
    zh: '开启 4 秒自动刷新',
    en: 'Enable 4s refresh',
  },
  'app.themeLight': {
    zh: '主题：浅色',
    en: 'Theme: Light',
  },
  'app.themeDark': {
    zh: '主题：深色',
    en: 'Theme: Dark',
  },
  'app.themeAuto': {
    zh: '主题：自动',
    en: 'Theme: Auto',
  },
  'app.languageChinese': {
    zh: '语言：中文',
    en: 'Language: Chinese',
  },
  'app.languageEnglish': {
    zh: '语言：英文',
    en: 'Language: English',
  },
  'app.aiGenerating': {
    zh: 'AI生成中',
    en: 'AI generating',
  },
  'app.aiThinking': {
    zh: 'AI思考中',
    en: 'AI thinking',
  },
  'app.letsBuild': {
    zh: '开始构建',
    en: "Let's build",
  },
  'app.chooseFolder': {
    zh: '选择目录',
    en: 'Choose folder',
  },
  'app.closeCodePreview': {
    zh: '关闭代码预览',
    en: 'Close code preview',
  },
  'app.queuedMessagesTitle': {
    zh: ({ count }) => `待发送 ${String(count)} 条`,
    en: ({ count }) => `${String(count)} queued`,
  },
  'app.queuedMessageQueuedAt': {
    zh: ({ time }) => `排队于 ${String(time)}`,
    en: ({ time }) => `Queued at ${String(time)}`,
  },
  'app.sharedSessionStatusIdle': {
    zh: '已同步',
    en: 'Synced',
  },
  'app.sharedSessionStatusRunning': {
    zh: '正在继续',
    en: 'Running',
  },
  'app.sharedSessionStatusNeedsAttention': {
    zh: '等待处理',
    en: 'Needs attention',
  },
  'app.sharedSessionStatusFailed': {
    zh: '本轮失败',
    en: 'Failed',
  },
  'app.sharedSessionStatusInterrupted': {
    zh: '已中断',
    en: 'Interrupted',
  },
  'app.sharedSessionStatusStaleOwner': {
    zh: '控制端可能过期',
    en: 'Owner may be stale',
  },
  'app.sharedSessionOwnerWeb': {
    zh: 'Web',
    en: 'Web',
  },
  'app.sharedSessionOwnerTerminal': {
    zh: '终端',
    en: 'Terminal',
  },
  'app.sharedSessionControlledBy': {
    zh: ({ owner }) => `当前由 ${String(owner)} 控制`,
    en: ({ owner }) => `Currently controlled by ${String(owner)}`,
  },
  'app.sharedSessionLatestTurn': {
    zh: '最近进展已同步',
    en: 'Latest progress synced',
  },
  'app.sharedSessionPendingApprovals': {
    zh: ({ count }) => `${String(count)} 条授权待处理`,
    en: ({ count }) => `${String(count)} approval(s) pending`,
  },
  'app.sharedSessionPendingApprovalsShort': {
    zh: ({ count }) => `${String(count)} 条授权`,
    en: ({ count }) => `${String(count)} approval(s)`,
  },
  'app.sharedSessionPendingAttentionRequests': {
    zh: ({ count }) => `${String(count)} 条待处理请求`,
    en: ({ count }) => `${String(count)} request(s) need attention`,
  },
  'app.sharedSessionPendingAttentionRequestsShort': {
    zh: ({ count }) => `${String(count)} 条待处理`,
    en: ({ count }) => `${String(count)} pending item(s)`,
  },
  'app.sharedSessionPersistedApprovalRecords': {
    zh: ({ count }) => `${String(count)} 条遗留授权记录`,
    en: ({ count }) => `${String(count)} stale approval record(s)`,
  },
  'app.sharedSessionPersistedApprovalRecordsShort': {
    zh: ({ count }) => `${String(count)} 条遗留记录`,
    en: ({ count }) => `${String(count)} stale record(s)`,
  },
  'app.sharedSessionApprovalNeedsReplay': {
    zh: ({ count }) => `${String(count)} 条授权记录已失效，请重新触发审批`,
    en: ({ count }) => `${String(count)} approval record(s) expired; re-trigger approval to continue`,
  },
  'app.sharedSessionReturnToOwner': {
    zh: '请返回控制端继续处理',
    en: 'Return to the owner client to continue',
  },
  'app.sharedSessionActiveTurn': {
    zh: '活动 Turn',
    en: 'Active turn',
  },
  'app.sharedSessionLatestError': {
    zh: ({ message }) => `最近错误：${String(message)}`,
    en: ({ message }) => `Latest error: ${String(message)}`,
  },
  'composer.model': {
    zh: '模型',
    en: 'Model',
  },
  'composer.thinking': {
    zh: '推理',
    en: 'Thinking',
  },
  'composer.reasoningEffort': {
    zh: '推理程度',
    en: 'Reasoning effort',
  },
  'composer.branch': {
    zh: '分支',
    en: 'Branch',
  },
  'composer.branchMenuTitle': {
    zh: '切换、创建或推送分支',
    en: 'Switch, create, or push branch',
  },
  'composer.branchWorkspaceHint': {
    zh: '分支操作会作用于当前工作区',
    en: 'Branch actions apply to the current workspace',
  },
  'composer.branchLoading': {
    zh: '正在读取分支...',
    en: 'Loading branches...',
  },
  'composer.branchCurrent': {
    zh: '当前',
    en: 'Current',
  },
  'composer.branchEmpty': {
    zh: '当前工作区没有可切换的本地分支',
    en: 'No local branches available',
  },
  'composer.branchCreatePlaceholder': {
    zh: '输入新分支名',
    en: 'New branch name',
  },
  'composer.branchCreate': {
    zh: '创建并切换',
    en: 'Create & switch',
  },
  'composer.branchPushTitle': {
    zh: '远端推送',
    en: 'Remote push',
  },
  'composer.branchPushLoading': {
    zh: '正在读取远端推送状态...',
    en: 'Loading remote push status...',
  },
  'composer.branchPushReady': {
    zh: ({ target }) => `有提交可推送到 ${String(target)}`,
    en: ({ target }) => `Commits are ready to push to ${String(target)}`,
  },
  'composer.branchPushAction': {
    zh: ({ target }) => `推送到 ${String(target)}`,
    en: ({ target }) => `Push to ${String(target)}`,
  },
  'composer.branchPushSetUpstreamAction': {
    zh: ({ target }) => `推送并关联 ${String(target)}`,
    en: ({ target }) => `Push and track ${String(target)}`,
  },
  'composer.branchPushUpToDate': {
    zh: '当前分支已与远端同步',
    en: 'Current branch is up to date with remote',
  },
  'composer.branchPushMissingUpstream': {
    zh: '当前分支尚未关联远端分支',
    en: 'Current branch has no upstream configured',
  },
  'composer.branchPushSuggestedCommand': {
    zh: ({ command }) => `请先在终端执行：${String(command)}`,
    en: ({ command }) => `Run this in a terminal first: ${String(command)}`,
  },
  'composer.branchPushDetachedHead': {
    zh: '当前 HEAD 未附着到命名分支，暂时不能推送',
    en: 'Current HEAD is detached, so push is unavailable',
  },
  'composer.branchPushBehindWarning': {
    zh: ({ count }) => `远端领先 ${String(count)} 个提交，推送可能失败`,
    en: ({ count }) => `Remote is ahead by ${String(count)} commits, so push may fail`,
  },
  'composer.pushBlockedUnresolvedScope': {
    zh: '存在未归属到当前工作区的审批请求或记录，暂时不能推送',
    en: 'Approval requests or records are not scoped to this workspace, so push is unavailable',
  },
  'composer.branchPushing': {
    zh: '推送中...',
    en: 'Pushing...',
  },
  'composer.branchSwitching': {
    zh: '切换中...',
    en: 'Switching...',
  },
  'composer.branchBlockedNotRepo': {
    zh: '当前目录不是 Git 仓库',
    en: 'Current folder is not a Git repository',
  },
  'composer.branchBlockedDirty': {
    zh: '工作区有未提交改动',
    en: 'Workspace has uncommitted changes',
  },
  'composer.branchBlockedInProgress': {
    zh: '有线程仍在执行中',
    en: 'A thread is still running',
  },
  'composer.branchBlockedQueued': {
    zh: '有排队中的消息待发送',
    en: 'Queued messages are pending',
  },
  'composer.branchBlockedPendingRequests': {
    zh: '有待处理的审批请求',
    en: 'Pending approval requests exist',
  },
  'composer.branchBlockedPersistedRequests': {
    zh: '检测到未闭合审批记录',
    en: 'Detected unresolved approval records',
  },
  'composer.branchGlobalRequestsHint': {
    zh: '当前会话存在未归属到此工作区的审批请求或记录，请先留意处理。',
    en: 'This session has approval requests or records that are not scoped to the current workspace.',
  },
  'composer.branchPersistedRecordsTitle': {
    zh: '未闭合审批记录',
    en: 'Unresolved approval records',
  },
  'composer.branchPersistedRecordReceivedAt': {
    zh: ({ time }) => `记录于 ${String(time)}`,
    en: ({ time }) => `Recorded at ${String(time)}`,
  },
  'composer.branchPersistedRecordDismiss': {
    zh: '忽略阻塞',
    en: 'Ignore block',
  },
  'composer.branchPersistedRecordDismissConfirm': {
    zh: '这只会忽略本地未闭合审批记录对分支切换的阻塞，不会处理实时审批。是否继续？',
    en: 'This only ignores the local blocking record for branch switching and will not resolve any live approval. Continue?',
  },
  'diffPanel.title': {
    zh: '差异面板',
    en: 'Diff panel',
  },
  'diffPanel.filesUnit': {
    zh: '个文件',
    en: 'files',
  },
  'diffPanel.mode.unstaged': {
    zh: '未暂存',
    en: 'Unstaged',
  },
  'diffPanel.mode.staged': {
    zh: '已暂存',
    en: 'Staged',
  },
  'diffPanel.mode.branch': {
    zh: '全部分支更改',
    en: 'Branch changes',
  },
  'diffPanel.mode.lastCommit': {
    zh: '上一轮更改',
    en: 'Last commit',
  },
  'diffPanel.mode.gitStatus': {
    zh: 'Git 状态',
    en: 'Git status',
  },
  'diffPanel.desc.unstaged': {
    zh: '显示当前工作区尚未暂存的内容差异。',
    en: 'Shows unstaged content differences in the current workspace.',
  },
  'diffPanel.desc.staged': {
    zh: '显示当前工作区已暂存但尚未提交的内容差异。',
    en: 'Shows staged but uncommitted content differences in the current workspace.',
  },
  'diffPanel.desc.branch': {
    zh: '显示当前分支相对基线分支的累计改动。',
    en: 'Shows cumulative changes on the current branch relative to the base branch.',
  },
  'diffPanel.desc.lastCommit': {
    zh: '显示最近一次提交的内容差异。',
    en: 'Shows the content differences from the most recent commit.',
  },
  'diffPanel.desc.gitStatus': {
    zh: '显示当前工作区的 Git 状态与阻塞原因。',
    en: 'Shows the current Git states and blockers for the workspace.',
  },
  'diffPanel.baseBranchLabel': {
    zh: '基线分支',
    en: 'Base branch',
  },
  'diffPanel.baseBranchAuto': {
    zh: '自动选择',
    en: 'Auto',
  },
  'diffPanel.baseBranchConfigured': {
    zh: ({ branch }) => `当前配置基线：${String(branch)}`,
    en: ({ branch }) => `Configured base: ${String(branch)}`,
  },
  'diffPanel.baseBranchInferred': {
    zh: ({ branch }) => `自动推导基线：${String(branch)}`,
    en: ({ branch }) => `Inferred base: ${String(branch)}`,
  },
  'diffPanel.empty.noChanges': {
    zh: '当前模式下没有可显示的差异。',
    en: 'No differences are available for this mode.',
  },
  'diffPanel.empty.branchBaseMissing': {
    zh: '未能从当前仓库的本地 Git 信息推导比较基线，暂时无法计算全部分支更改。',
    en: 'A comparison base could not be inferred from local Git metadata, so branch changes cannot be computed yet.',
  },
  'diffPanel.empty.warning': {
    zh: '当前模式无法稳定生成差异，请查看提示信息。',
    en: 'The selected mode could not produce a stable diff. See the warning for details.',
  },
  'diffPanel.gitStatusCurrentBranch': {
    zh: ({ branch }) => `当前分支：${String(branch)}`,
    en: ({ branch }) => `Current branch: ${String(branch)}`,
  },
  'diffPanel.gitStatusBlockersTitle': {
    zh: '当前阻塞原因',
    en: 'Current blockers',
  },
  'diffPanel.gitStatusEmpty': {
    zh: '当前工作区没有额外的 Git 状态条目。',
    en: 'No additional Git state entries were found for this workspace.',
  },
  'diffPanel.gitStatusTagStaged': {
    zh: '已暂存',
    en: 'Staged',
  },
  'diffPanel.gitStatusTagUnstaged': {
    zh: '未暂存',
    en: 'Unstaged',
  },
  'diffPanel.gitStatusKind.modified': {
    zh: '已修改',
    en: 'Modified',
  },
  'diffPanel.gitStatusKind.added': {
    zh: '新增',
    en: 'Added',
  },
  'diffPanel.gitStatusKind.deleted': {
    zh: '删除',
    en: 'Deleted',
  },
  'diffPanel.gitStatusKind.renamed': {
    zh: '重命名',
    en: 'Renamed',
  },
  'diffPanel.gitStatusKind.untracked': {
    zh: '未跟踪',
    en: 'Untracked',
  },
  'diffPanel.gitStatusKind.conflicted': {
    zh: '冲突',
    en: 'Conflicted',
  },
  'diffPanel.gitStatusKind.unknown': {
    zh: '未知',
    en: 'Unknown',
  },
  'composer.branchDirtyTrackedModified': {
    zh: ({ count }) => `已修改 ${String(count)} 项`,
    en: ({ count }) => `${String(count)} modified`,
  },
  'composer.branchDirtyStaged': {
    zh: ({ count }) => `已暂存 ${String(count)} 项`,
    en: ({ count }) => `${String(count)} staged`,
  },
  'composer.branchDirtyUntracked': {
    zh: ({ count }) => `未跟踪 ${String(count)} 项`,
    en: ({ count }) => `${String(count)} untracked`,
  },
  'composer.branchDirtyConflicted': {
    zh: ({ count }) => `冲突 ${String(count)} 项`,
    en: ({ count }) => `${String(count)} conflicted`,
  },
  'composer.branchDirtyRenamed': {
    zh: ({ count }) => `重命名 ${String(count)} 项`,
    en: ({ count }) => `${String(count)} renamed`,
  },
  'composer.branchDirtyDeleted': {
    zh: ({ count }) => `删除 ${String(count)} 项`,
    en: ({ count }) => `${String(count)} deleted`,
  },
  'composer.branchDirtyEntriesTitle': {
    zh: '涉及文件',
    en: 'Affected files',
  },
  'composer.branchDirtyEntriesMore': {
    zh: ({ count }) => `另有 ${String(count)} 项`,
    en: ({ count }) => `${String(count)} more`,
  },
  'composer.quotaRemaining': {
    zh: ({ percent }) => `${String(percent)}% 额度`,
    en: ({ percent }) => `${String(percent)}% quota`,
  },
  'composer.quotaRemainingWindow': {
    zh: ({ percent, window }) => `${String(percent)}% ${String(window)}额度`,
    en: ({ percent, window }) => `${String(percent)}% ${String(window)} quota`,
  },
  'composer.quotaUsageTitle': {
    zh: '额度剩余：',
    en: 'Quota remaining:',
  },
  'composer.quotaRemainingTitle': {
    zh: '剩余额度',
    en: 'Remaining quota',
  },
  'composer.quotaUsageSummary': {
    zh: ({ used, remaining }) => `${String(used)}% 已用（剩余 ${String(remaining)}%）`,
    en: ({ used, remaining }) => `${String(used)}% used (${String(remaining)}% left)`,
  },
  'composer.quotaWindowDuration': {
    zh: ({ duration }) => `周期：${String(duration)}`,
    en: ({ duration }) => `Window: ${String(duration)}`,
  },
  'composer.quotaWindowUnknown': {
    zh: '未知周期',
    en: 'Unknown window',
  },
  'composer.quotaWindowWeeks': {
    zh: ({ weeks }) => `${String(weeks)} 周`,
    en: ({ weeks }) => `${String(weeks)} week`,
  },
  'composer.quotaWindowDays': {
    zh: ({ days }) => `${String(days)} 天`,
    en: ({ days }) => `${String(days)} day`,
  },
  'composer.quotaWindowHours': {
    zh: ({ hours }) => `${String(hours)} 小时`,
    en: ({ hours }) => `${String(hours)} hour`,
  },
  'composer.quotaWindowMinutes': {
    zh: ({ minutes }) => `${String(minutes)} 分钟`,
    en: ({ minutes }) => `${String(minutes)} min`,
  },
  'composer.quotaWindowCompactWeeks': {
    zh: ({ weeks }) => `${String(weeks)}周`,
    en: ({ weeks }) => `${String(weeks)} week`,
  },
  'composer.quotaWindowCompactDays': {
    zh: ({ days }) => `${String(days)}天`,
    en: ({ days }) => `${String(days)} day`,
  },
  'composer.quotaWindowCompactHours': {
    zh: ({ hours }) => `${String(hours)}小时`,
    en: ({ hours }) => `${String(hours)} hr`,
  },
  'composer.quotaWindowCompactMinutes': {
    zh: ({ minutes }) => `${String(minutes)}分钟`,
    en: ({ minutes }) => `${String(minutes)} min`,
  },
  'composer.quotaResetAt': {
    zh: ({ time }) => `重置时间：${String(time)}`,
    en: ({ time }) => `Resets at: ${String(time)}`,
  },
  'composer.quotaDataUnavailable': {
    zh: '等待额度数据',
    en: 'Waiting for quota data',
  },
  'composer.resetSuffix': {
    zh: '重置',
    en: 'reset',
  },
  'composer.aiCreditsUnlimited': {
    zh: 'AI Credits：无限制',
    en: 'AI Credits: Unlimited',
  },
  'composer.aiCreditsBalance': {
    zh: ({ balance }) => `AI Credits 余额：${String(balance)}`,
    en: ({ balance }) => `AI Credits balance: ${String(balance)}`,
  },
  'composer.aiCreditsAvailable': {
    zh: 'AI Credits：可用',
    en: 'AI Credits: Available',
  },
  'composer.modePlan': {
    zh: '规划',
    en: 'Plan',
  },
  'composer.modeAct': {
    zh: '执行',
    en: 'Act',
  },
  'composer.aiCreditsDepleted': {
    zh: 'AI Credits：已用尽',
    en: 'AI Credits: Depleted',
  },
  'composer.contextUsageTitle': {
    zh: '背景信息窗口：',
    en: 'Context window:',
  },
  'composer.contextUsageSummary': {
    zh: ({ used, remaining }) => `${String(used)}% 已用（剩余 ${String(remaining)}%）`,
    en: ({ used, remaining }) => `${String(used)}% used (${String(remaining)}% left)`,
  },
  'composer.contextTokensSummary': {
    zh: ({ usedTokens, totalTokens }) => `已用 ${String(usedTokens)} 标记，共 ${String(totalTokens)}`,
    en: ({ usedTokens, totalTokens }) => `${String(usedTokens)} used, ${String(totalTokens)} total`,
  },
  'composer.contextAutoCompressHint': {
    zh: 'Codex 自动压缩其背景信息',
    en: 'Codex auto-compresses background context',
  },
  'composer.contextDataUnavailable': {
    zh: '等待上下文用量数据',
    en: 'Waiting for context usage',
  },
  'composer.compactNow': {
    zh: '立即压缩',
    en: 'Compact now',
  },
  'composer.compacting': {
    zh: '压缩中...',
    en: 'Compacting...',
  },
  'composer.typeMessage': {
    zh: '输入消息...',
    en: 'Type a message...',
  },
  'composer.voiceInput': {
    zh: '语音输入',
    en: 'Voice input',
  },
  'composer.voiceListening': {
    zh: '正在聆听语音',
    en: 'Listening for speech',
  },
  'composer.voiceRecording': {
    zh: '正在录音',
    en: 'Recording audio',
  },
  'composer.voiceTranscribing': {
    zh: '正在转写语音',
    en: 'Transcribing audio',
  },
  'composer.voiceUnsupported': {
    zh: '当前环境暂不支持语音输入',
    en: 'Voice input is unavailable in this environment',
  },
  'composer.voicePermissionDenied': {
    zh: '麦克风权限被拒绝',
    en: 'Microphone permission was denied',
  },
  'composer.voiceTranscriptionFailed': {
    zh: '语音转写失败，请重试',
    en: 'Voice transcription failed. Try again.',
  },
  'composer.selectThreadFirst': {
    zh: '请选择一个会话后再发送消息',
    en: 'Select a thread to send a message',
  },
  'composer.reasoning.none': {
    zh: '无',
    en: 'None',
  },
  'composer.reasoning.minimal': {
    zh: '极低',
    en: 'Minimal',
  },
  'composer.reasoning.low': {
    zh: '低',
    en: 'Low',
  },
  'composer.reasoning.medium': {
    zh: '中',
    en: 'Medium',
  },
  'composer.reasoning.high': {
    zh: '高',
    en: 'High',
  },
  'composer.reasoning.xhigh': {
    zh: '超高',
    en: 'Extra high',
  },
  'threadConversation.loadingMessages': {
    zh: '正在加载消息...',
    en: 'Loading messages...',
  },
  'threadConversation.noMessages': {
    zh: '当前会话还没有消息',
    en: 'No messages in this thread yet.',
  },
  'threadConversation.approvalCommandTitle': {
    zh: '是否允许执行此命令？',
    en: 'Allow this command to run?',
  },
  'threadConversation.approvalFileTitle': {
    zh: '是否允许应用这些文件改动？',
    en: 'Allow these file changes?',
  },
  'threadConversation.approvalSubmit': {
    zh: '提交',
    en: 'Submit',
  },
  'threadConversation.approvalSkip': {
    zh: '跳过',
    en: 'Skip',
  },
  'threadConversation.approvalCwdLabel': {
    zh: '执行目录',
    en: 'Working directory',
  },
  'threadConversation.approvalReasonLabel': {
    zh: '触发原因',
    en: 'Reason',
  },
  'threadConversation.approvalSummaryLabel': {
    zh: '预计操作',
    en: 'Planned actions',
  },
  'threadConversation.approvalGrantRootLabel': {
    zh: '授权目录',
    en: 'Granted root',
  },
  'threadConversation.approvalFileSummary': {
    zh: ({ count, additions, deletions }) => `共 ${String(count)} 个文件，+${String(additions)} / -${String(deletions)}`,
    en: ({ count, additions, deletions }) => `${String(count)} files, +${String(additions)} / -${String(deletions)}`,
  },
  'threadConversation.approvalOpenDiff': {
    zh: '查看完整 Diff',
    en: 'Open full diff',
  },
  'threadConversation.otherAnswer': {
    zh: '其他答案',
    en: 'Other answer',
  },
  'threadConversation.submitAnswers': {
    zh: '提交答案',
    en: 'Submit Answers',
  },
  'threadConversation.accept': {
    zh: '同意',
    en: 'Accept',
  },
  'threadConversation.acceptForSession': {
    zh: '本次会话同意',
    en: 'Accept for Session',
  },
  'threadConversation.decline': {
    zh: '拒绝',
    en: 'Decline',
  },
  'threadConversation.cancel': {
    zh: '取消',
    en: 'Cancel',
  },
  'threadConversation.failToolCall': {
    zh: '标记工具调用失败',
    en: 'Fail Tool Call',
  },
  'threadConversation.successEmpty': {
    zh: '成功（空结果）',
    en: 'Success (Empty)',
  },
  'threadConversation.returnEmptyResult': {
    zh: '返回空结果',
    en: 'Return Empty Result',
  },
  'threadConversation.rejectRequest': {
    zh: '拒绝请求',
    en: 'Reject Request',
  },
  'threadConversation.requestMeta': {
    zh: ({ id, time }) => `请求 #${String(id)} · ${String(time)}`,
    en: ({ id, time }) => `Request #${String(id)} · ${String(time)}`,
  },
  'threadConversation.workedFor': {
    zh: ({ duration }) => `耗时 ${String(duration)}`,
    en: ({ duration }) => `Worked for ${String(duration)}`,
  },
  'threadConversation.copy': {
    zh: '复制',
    en: 'Copy',
  },
  'threadConversation.copied': {
    zh: '已复制',
    en: 'Copied',
  },
  'threadConversation.copyMessage': {
    zh: '复制消息',
    en: 'Copy message',
  },
  'threadConversation.undoLatestFileChange': {
    zh: '撤销本次变更',
    en: 'Undo this change',
  },
  'threadConversation.reapplyLatestFileChange': {
    zh: '重新应用本次变更',
    en: 'Reapply this change',
  },
  'threadConversation.viewFileChangeDiff': {
    zh: '查看 Diff',
    en: 'View diff',
  },
  'sidebar.expand': {
    zh: '展开侧边栏',
    en: 'Expand sidebar',
  },
  'sidebar.collapse': {
    zh: '收起侧边栏',
    en: 'Collapse sidebar',
  },
  'sidebar.startNewThread': {
    zh: '开始新会话',
    en: 'Start new thread',
  },
  'sidebarTree.threads': {
    zh: '会话',
    en: 'Threads',
  },
  'sidebarTree.noMatchingThreads': {
    zh: '没有匹配的会话',
    en: 'No matching threads',
  },
  'sidebarTree.loadingThreads': {
    zh: '会话加载中...',
    en: 'Loading threads...',
  },
  'sidebarTree.editName': {
    zh: '重命名',
    en: 'Rename',
  },
  'sidebarTree.remove': {
    zh: '移除',
    en: 'Remove',
  },
  'sidebarTree.projectName': {
    zh: '项目名称',
    en: 'Project name',
  },
  'sidebarTree.threadName': {
    zh: '会话名称',
    en: 'Thread name',
  },
  'sidebarTree.noThreads': {
    zh: '暂无会话',
    en: 'No threads',
  },
  'sidebarTree.showLess': {
    zh: '收起',
    en: 'Show less',
  },
  'sidebarTree.showMore': {
    zh: '展开更多',
    en: 'Show more',
  },
  'sidebarTree.pin': {
    zh: '置顶',
    en: 'Pin',
  },
  'sidebarTree.archiveThread': {
    zh: '归档会话',
    en: 'Archive thread',
  },
  'sidebarTree.confirm': {
    zh: '确认',
    en: 'Confirm',
  },
  'sidebarTree.projectMenu': {
    zh: '项目菜单',
    en: 'Project menu',
  },
  'sidebarTree.newThreadInProject': {
    zh: ({ projectName }) => `在 ${String(projectName)} 中新建会话`,
    en: ({ projectName }) => `Start new thread in ${String(projectName)}`,
  },
  'sidebarTree.na': {
    zh: '未知',
    en: 'n/a',
  },
  'sidebarTree.now': {
    zh: '刚刚',
    en: 'now',
  },
  'sidebarTree.minutesAgo': {
    zh: ({ minutes }) => `${String(minutes)} 分钟前`,
    en: ({ minutes }) => `${String(minutes)}m ago`,
  },
  'sidebarTree.hoursAgo': {
    zh: ({ hours }) => `${String(hours)} 小时前`,
    en: ({ hours }) => `${String(hours)}h ago`,
  },
  'sidebarTree.daysAgo': {
    zh: ({ days }) => `${String(days)} 天前`,
    en: ({ days }) => `${String(days)}d ago`,
  },
} as const satisfies Record<string, { zh: UiTextValue; en: UiTextValue }>

export type UiTextKey = keyof typeof UI_TEXT

export function tUi(language: UiLanguage, key: UiTextKey, params: UiTextParams = {}): string {
  const entry = UI_TEXT[key]
  const value = entry[language]
  if (typeof value === 'function') {
    return value(params)
  }
  return value
}
