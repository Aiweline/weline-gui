import type { Direction } from '../types';

const en = {
  brand: { name: 'Weline', product: 'Control Center', agent: 'Host agent' },
  navigation: {
    dashboard: 'Overview', instances: 'WLS services', websites: 'Websites', sites: 'Domains & TLS', console: 'Command console',
    panel: 'WLS panel', updates: 'Updates', settings: 'Settings',
  },
  common: {
    online: 'Online', offline: 'Offline', running: 'Running', stopped: 'Stopped', loading: 'Loading',
    refresh: 'Refresh data', reloadPage: 'Reload page', save: 'Save settings', start: 'Start', stop: 'Stop',
    restart: 'Restart', reload: 'Hot reload',
    cancel: 'Cancel', continue: 'Continue', back: 'Back', noData: 'No data yet', copy: 'Copy', open: 'Open',
  },
  dashboard: {
    eyebrow: 'Live host telemetry', title: 'Everything WLS needs, at a glance.',
    subtitle: 'Start services, inspect every WLS process and watch host capacity from one calm surface.',
    cpu: 'CPU load', memory: 'Memory', disk: 'Disk available', network: 'Network total', uptime: 'Host uptime',
    onlineInstances: 'Online instances', trackedProcesses: 'Tracked processes', quickControl: 'Quick control',
    performance: 'Performance pulse', processTitle: 'WLS process topology', processHint: 'Master, workers and supporting services detected on this host.',
    lastUpdated: 'Last updated', frameworkRoot: 'Framework root', noRunning: 'No WLS instance is running.',
  },
  instances: {
    title: 'WLS services', subtitle: 'Lifecycle control uses the framework’s own server commands and protected IPC.',
    instance: 'Instance', endpoint: 'Endpoint', workers: 'Workers', pid: 'PID', runtime: 'Runtime', actions: 'Actions',
    startDefault: 'Start default service', commandComplete: 'Command completed',
    public: 'Public edge', upstream: 'Worker origin', gateway: 'Public gateway', masterPid: 'Master PID', edgePid: 'Edge PID',
    nginx: 'Managed Nginx', sharedGateway: 'Shared gateway', pureWls: 'Direct WLS',
    workerDirect: 'Direct workers', dispatcher: 'Dispatcher', thisInstance: 'this instance',
    joinedGateway: 'joined this gateway', noGateway: 'no public gateway',
    gatewayOwnerSelf: 'This host', gatewayOwnerChip: 'Gateway',
    gatewayOwnsNginx: 'This instance owns managed Nginx',
    gatewayOwnsShared: 'This instance is the shared gateway',
    gatewayJoined: 'Joined gateway {{name}}',
  },
      websites: {
        title: 'Websites', subtitle: 'Lists and creates sites through the Weline Websites module.',
        create: 'New website', save: 'Create website', name: 'Site name', url: 'Primary domain', code: 'Code',
        codeHint: 'Optional, derived from the domain', language: 'Language', currency: 'Currency',
        default: 'Default', empty: 'No websites yet.', moduleHint: 'Uses php bin/w website:create → websites.createWebsite',
        loadError: 'Could not load websites',
        loadErrorHint: 'The current project did not return a website list. Check Settings, then retry.',
        createError: 'Could not create the website',
        poolPlaceholder: 'Select a ready domain from the pool',
        poolHint: 'Same domain pool as admin. Complex multi-domain or sub-path setup belongs in the backend.',
        poolEmpty: 'No ready unused domains in the pool.',
        poolRequired: 'Select a domain from the pool first.',
        openBackend: 'Open backend domain pool',
      },
  sites: {
    title: 'Domains & certificates', subtitle: 'Configured sites and active WLS endpoints are probed from the host.',
    domain: 'Domain', source: 'Source', certificate: 'Certificate', subject: 'Subject', issuer: 'Issuer', fingerprint: 'SHA-256 fingerprint', expires: 'Expires',
    days: '{{count}} days', valid: 'Valid', invalid: 'Needs attention', noTls: 'No TLS certificate data',
    publicUrlRequired: 'Configure the public website URL to inspect its TLS certificate.',
    tlsDisabled: 'TLS is not enabled for this URL.',
    delete: 'Delete certificate',
    deleteFailed: 'Could not delete the certificate',
    deleteConfirmTitle: 'This certificate is still referenced by a site',
    deleteConfirmBody: '{{domain}} is still used by {{sites}}. Delete it anyway?',
    deleteConfirmAction: 'Delete anyway',
  },
  console: {
    title: 'Framework command console', subtitle: 'Only parameterized php bin/w commands run. Shell operators are never accepted.',
    placeholder: 'php bin/w server:status --doctor --json', run: 'Run command', history: 'Recent output',
    safeBoundary: 'Framework CLI only · no shell', exitCode: 'Exit code {{code}}', empty: 'Run a framework command to see its output here.',
  },
  panel: {
    title: 'Embedded WLS management panel', subtitle: 'Uses the configured admin URL and its existing login session.',
    missing: 'Configure the WLS management URL in Settings first.',
    frameBlocked: 'If the site blocks embedding, open it in a separate window.',
    frameHint: 'Embedded from this control center. If you are signed out, the backend login page appears here first.',
    loading: 'Loading the embedded WLS panel (login page if signed out)…',
    embedBlocked: 'This host still refused the embedded panel. Open it in a window instead.',
    embedEmpty: 'The embedded panel stayed blank (often login X-Frame-Options). Open it in a window, or refresh this view.',
    embedTimeout: 'The embedded panel did not finish loading. The site may be in maintenance or blocking iframes — open it in a window.',
    openWindow: 'Open WLS panel',
  },
  updates: {
    title: 'Release updates', subtitle: 'Checks the latest published GitHub Release using semantic versions.',
    check: 'Check GitHub now', current: 'Installed', latest: 'Latest release', available: 'Update available',
    currentStatus: 'You are up to date', configure: 'Configure owner/repository in Settings.',
    signed: 'Installable desktop updates must be signed; unsigned GitHub assets are never applied.', releaseNotes: 'Release notes',
  },
  settings: {
    title: 'Settings', subtitle: 'Connection, project discovery and monitoring preferences.', language: 'Interface language',
    frameworkRoot: 'Weline framework root', phpBinary: 'PHP binary', github: 'GitHub repository',
    githubHint: 'owner/repository', adminUrl: 'WLS admin panel URL', sites: 'Website URLs',
    sitesHint: 'One complete http(s) URL per line', refresh: 'Refresh interval (seconds)', connection: 'Client connection',
    local: 'This device / desktop', remote: 'Remote host agent', agentUrl: 'Agent URL', token: 'Access token', saved: 'Settings saved',
  },
  setup: {
    badge: 'First-run setup', title: 'Bring your Weline host into view.',
    subtitle: 'Choose a language, then connect this app to the machine that runs WLS.',
    languageStep: 'Choose language', connectionStep: 'Choose host', projectStep: 'Configure project',
    localTitle: 'Manage this computer', localText: 'macOS, Windows and Linux desktop can start and inspect local WLS.',
    remoteTitle: 'Connect to a server', remoteText: 'Use this for iOS, Android or a different computer.',
    finish: 'Open control center', tokenHint: 'The token is printed when weline-agent starts.',
    scanHint: 'Local mode scans this computer. Choose the running project, or add a custom one.',
    remoteProjectHint: 'Remote mode needs the host agent URL and token. Project files are read from that server.',
    scanning: 'Scanning local Weline projects…',
    scanEmpty: 'No local project was found. Add one manually.',
    scanRetry: 'Scan again',
    customAdd: 'Add custom project',
    chooseScanned: 'Choose scanned project',
    running: 'Running now',
    found: '{{count}} projects found',
    customPathHint: 'Absolute path to a directory that contains bin/w',
    scanRequiresDesktop: 'Local project scanning needs the desktop app (or a running weline-agent on 127.0.0.1:17640). Keep this selection list, or add a custom path.',
  },
  errors: { unavailable: 'The host agent is unavailable.', retry: 'Retry', details: 'Details', unauthorized: 'Access token was rejected.' },
};

type Messages = typeof en;
type DeepPartial<T> = {
  [Key in keyof T]?: T[Key] extends Record<string, unknown> ? DeepPartial<T[Key]> : T[Key];
};

function merge(overrides: DeepPartial<Messages>): Messages {
  return {
    ...en,
    ...overrides,
    brand: { ...en.brand, ...overrides.brand },
    navigation: { ...en.navigation, ...overrides.navigation },
    common: { ...en.common, ...overrides.common },
    dashboard: { ...en.dashboard, ...overrides.dashboard },
    instances: { ...en.instances, ...overrides.instances },
    websites: { ...en.websites, ...overrides.websites },
    sites: { ...en.sites, ...overrides.sites },
    console: { ...en.console, ...overrides.console },
    panel: { ...en.panel, ...overrides.panel },
    updates: { ...en.updates, ...overrides.updates },
    settings: { ...en.settings, ...overrides.settings },
    setup: { ...en.setup, ...overrides.setup },
    errors: { ...en.errors, ...overrides.errors },
  };
}

export interface LocaleDefinition {
  label: string;
  nativeLabel: string;
  direction: Direction;
  messages: Messages;
}

export const localeCatalog: Record<string, LocaleDefinition> = {
  en: { label: 'English', nativeLabel: 'English', direction: 'ltr', messages: en },
  'zh-CN': {
    label: 'Simplified Chinese', nativeLabel: '简体中文', direction: 'ltr', messages: merge({
      brand: { name: 'Weline', product: '控制中心', agent: '宿主代理' },
      navigation: { dashboard: '总览', instances: 'WLS 服务', websites: '网站', sites: '域名与证书', console: '命令控制台', panel: 'WLS 面板', updates: '版本更新', settings: '设置' },
      common: { online: '在线', offline: '离线', running: '运行中', stopped: '已停止', loading: '加载中', refresh: '刷新数据', reloadPage: '刷新页面', save: '保存设置', start: '启动', stop: '停止', restart: '重启', reload: '热重载', cancel: '取消', continue: '继续', back: '返回', noData: '暂无数据', copy: '复制', open: '打开' },
      dashboard: { eyebrow: '宿主实时指标', title: '一眼掌握 WLS 的全部状态。', subtitle: '在一个清晰界面中启动服务、查看每个 WLS 进程并监控宿主容量。', cpu: 'CPU 负载', memory: '内存', disk: '可用磁盘', network: '网络总量', uptime: '运行时间', onlineInstances: '在线实例', trackedProcesses: '监控进程', quickControl: '快捷控制', performance: '性能趋势', processTitle: 'WLS 进程拓扑', processHint: '已识别本机 Master、Worker 与配套服务。', lastUpdated: '最后更新', frameworkRoot: '框架目录', noRunning: '当前没有运行中的 WLS 实例。' },
      instances: { title: 'WLS 服务', subtitle: '启停操作使用框架原生命令和受保护 IPC。', instance: '实例', endpoint: '访问地址', workers: 'Worker', pid: 'PID', runtime: '运行时长', actions: '操作', startDefault: '启动默认服务', commandComplete: '命令执行完成', public: '公网入口', upstream: 'Worker 回源', gateway: '公网网关', masterPid: 'Master PID', edgePid: '边缘 PID', nginx: '托管 Nginx', sharedGateway: '共享网关', pureWls: '纯 WLS', workerDirect: '直连', dispatcher: '派遣器', thisInstance: '本实例', joinedGateway: '接入该网关', noGateway: '无公网网关', gatewayOwnerSelf: '本机网关', gatewayOwnerChip: '网关', gatewayOwnsNginx: '本实例持有托管 Nginx', gatewayOwnsShared: '本实例即共享网关', gatewayJoined: '接入网关 {{name}}' },
      websites: { title: '网站', subtitle: '列表与新建都调用 Weline 网站模块，不另写一套。', create: '新建网站', save: '创建网站', name: '网站名称', url: '主地址', code: '代码', codeHint: '可留空，按域名生成', language: '语言', currency: '货币', default: '默认站', empty: '还没有网站。', moduleHint: '走 php bin/w website:create → websites.createWebsite', loadError: '网站列表未能加载', loadErrorHint: '当前项目没有返回网站数据。请到设置确认框架目录后重试。', createError: '未能创建网站', poolPlaceholder: '从域名池选择已就绪域名', poolHint: '与后台同源域名池。多域、子路径等复杂配置请进后台处理。', poolEmpty: '域名池暂无可用（就绪且未占用）域名。', poolRequired: '请先从域名池选择主地址。', openBackend: '打开后台域名池' },
      sites: { title: '域名与证书', subtitle: '从宿主探测已配置网站和在线 WLS 端点。', domain: '域名', source: '来源', certificate: '证书', subject: '证书主题', issuer: '签发者', fingerprint: 'SHA-256 指纹', expires: '到期时间', days: '{{count}} 天', valid: '有效', invalid: '需要处理', noTls: '暂无 TLS 证书数据', publicUrlRequired: '请配置网站公网地址以检查其 TLS 证书。', tlsDisabled: '此地址尚未启用 TLS。', delete: '删除证书', deleteFailed: '未能删除证书', deleteConfirmTitle: '证书仍被站点引用', deleteConfirmBody: '{{domain}} 仍被 {{sites}} 使用。确定继续删除？', deleteConfirmAction: '仍要删除' },
      console: { title: '框架命令控制台', subtitle: '仅运行参数化 php bin/w 命令，绝不接受 Shell 运算符。', placeholder: 'php bin/w server:status --doctor --json', run: '运行命令', history: '最近输出', safeBoundary: '仅限框架 CLI · 无 Shell', exitCode: '退出码 {{code}}', empty: '运行框架命令后，输出会显示在这里。' },
      panel: { title: '内嵌 WLS 管理面板', subtitle: '使用设置中的后台地址及其现有登录会话。', missing: '请先在设置中填写 WLS 管理面板地址。', frameBlocked: '如果网站禁止内嵌，请在独立窗口打开。', frameHint: '由控制中心内嵌。未登录时会显示后台登录页，登录后回到 WLS 面板。', loading: '正在加载内嵌 WLS 面板（若未登录将进入登录页）…', embedBlocked: '宿主仍拒绝内嵌该面板，请改在独立窗口打开。', embedEmpty: '内嵌区域仍是空白（常见原因是登录页 X-Frame-Options）。请点「打开」用独立窗口，或刷新本页重试。', embedTimeout: '内嵌面板未在时限内加载完成。站点可能处于维护或禁止 iframe——请改用独立窗口打开。', openWindow: '打开 WLS 面板' },
      updates: { title: '版本更新', subtitle: '通过语义版本检查 GitHub 最新正式 Release。', check: '立即检查 GitHub', current: '已安装', latest: '最新版本', available: '发现新版本', currentStatus: '当前已是最新版', configure: '请先在设置中填写 owner/repository。', signed: '桌面更新包必须通过签名验证；绝不会安装未签名的 GitHub 资源。', releaseNotes: '更新说明' },
      settings: { title: '设置', subtitle: '连接、项目发现与监控偏好。', language: '界面语言', frameworkRoot: 'Weline 框架目录', phpBinary: 'PHP 可执行文件', github: 'GitHub 仓库', githubHint: 'owner/repository', adminUrl: 'WLS 管理面板地址', sites: '网站地址', sitesHint: '每行一个完整 http(s) 地址', refresh: '刷新间隔（秒）', connection: '客户端连接', local: '本机/桌面', remote: '远程宿主代理', agentUrl: '代理地址', token: '访问令牌', saved: '设置已保存' },
      setup: { badge: '首次安装向导', title: '把 Weline 宿主尽收眼底。', subtitle: '先选择语言，再连接运行 WLS 的机器。', languageStep: '选择语言', connectionStep: '选择宿主', projectStep: '配置项目', localTitle: '管理本机', localText: 'macOS、Windows 和 Linux 桌面可直接启停与监控本机 WLS。', remoteTitle: '连接服务器', remoteText: 'iOS、Android 或其他电脑请选择此项。', finish: '进入控制中心', tokenHint: '启动 weline-agent 时会在终端显示令牌。', scanHint: '本机模式会自动扫描。选中当前已启动的项目，也可以自定义新增。', remoteProjectHint: '线上模式才需要填写宿主代理地址和令牌；项目信息从那台服务器读取。', scanning: '正在扫描本机 Weline 项目…', scanEmpty: '没有扫到本机项目，请自定义新增。', scanRetry: '重新扫描', customAdd: '自定义新增', chooseScanned: '选择已扫描项目', running: '正在运行', found: '已找到 {{count}} 个项目', customPathHint: '填写包含 bin/w 的绝对路径', scanRequiresDesktop: '本机扫描需要桌面客户端（或本机已启动 weline-agent：127.0.0.1:17640）。请留在此选择列表，或点「自定义新增」。' },
      errors: { unavailable: '无法连接宿主代理。', retry: '重试', details: '详情', unauthorized: '访问令牌校验失败。' },
    })
  },
  es: { label: 'Spanish', nativeLabel: 'Español', direction: 'ltr', messages: merge({ navigation: { dashboard: 'Resumen', instances: 'Servicios WLS', websites: 'Sitios', sites: 'Dominios y TLS', console: 'Consola', panel: 'Panel WLS', updates: 'Actualizaciones', settings: 'Ajustes' }, common: { online: 'En línea', offline: 'Sin conexión', running: 'En ejecución', stopped: 'Detenido', loading: 'Cargando', refresh: 'Actualizar', save: 'Guardar', start: 'Iniciar', stop: 'Detener', restart: 'Reiniciar', reload: 'Recarga', cancel: 'Cancelar', continue: 'Continuar', back: 'Atrás', noData: 'Sin datos', copy: 'Copiar', open: 'Abrir' }, dashboard: { title: 'Todo WLS de un vistazo.', subtitle: 'Inicia servicios, revisa procesos y supervisa el host desde una sola vista.' }, settings: { title: 'Ajustes', language: 'Idioma de la interfaz' }, setup: { title: 'Pon tu host Weline a la vista.', languageStep: 'Elegir idioma', connectionStep: 'Elegir host', projectStep: 'Configurar proyecto', finish: 'Abrir centro de control' } }) },
  hi: { label: 'Hindi', nativeLabel: 'हिन्दी', direction: 'ltr', messages: merge({ navigation: { dashboard: 'अवलोकन', instances: 'WLS सेवाएँ', websites: 'वेबसाइटें', sites: 'डोमेन और TLS', console: 'कमांड कंसोल', panel: 'WLS पैनल', updates: 'अपडेट', settings: 'सेटिंग्स' }, common: { online: 'ऑनलाइन', offline: 'ऑफ़लाइन', running: 'चल रहा है', stopped: 'रुका हुआ', loading: 'लोड हो रहा है', refresh: 'रीफ़्रेश', save: 'सेटिंग्स सहेजें', start: 'शुरू करें', stop: 'रोकें', restart: 'पुनः शुरू', reload: 'हॉट रीलोड', cancel: 'रद्द करें', continue: 'जारी रखें', back: 'वापस', noData: 'कोई डेटा नहीं', copy: 'कॉपी', open: 'खोलें' }, dashboard: { title: 'WLS की पूरी स्थिति एक नज़र में।', subtitle: 'एक ही जगह से सेवा शुरू करें, प्रक्रियाएँ देखें और होस्ट क्षमता मॉनिटर करें।' }, settings: { title: 'सेटिंग्स', language: 'इंटरफ़ेस भाषा' }, setup: { title: 'अपने Weline होस्ट को नियंत्रण में लाएँ।', languageStep: 'भाषा चुनें', connectionStep: 'होस्ट चुनें', projectStep: 'प्रोजेक्ट कॉन्फ़िगर करें', finish: 'कंट्रोल सेंटर खोलें' } }) },
  ar: { label: 'Arabic', nativeLabel: 'العربية', direction: 'rtl', messages: merge({ navigation: { dashboard: 'نظرة عامة', instances: 'خدمات WLS', websites: 'المواقع', sites: 'النطاقات وTLS', console: 'وحدة الأوامر', panel: 'لوحة WLS', updates: 'التحديثات', settings: 'الإعدادات' }, common: { online: 'متصل', offline: 'غير متصل', running: 'قيد التشغيل', stopped: 'متوقف', loading: 'جار التحميل', refresh: 'تحديث', save: 'حفظ الإعدادات', start: 'تشغيل', stop: 'إيقاف', restart: 'إعادة تشغيل', reload: 'إعادة تحميل', cancel: 'إلغاء', continue: 'متابعة', back: 'رجوع', noData: 'لا توجد بيانات', copy: 'نسخ', open: 'فتح' }, dashboard: { title: 'كل ما يحتاجه WLS في لمحة.', subtitle: 'شغّل الخدمات وراقب العمليات وموارد المضيف من واجهة واحدة.' }, settings: { title: 'الإعدادات', language: 'لغة الواجهة' }, setup: { title: 'ضع مضيف Weline أمامك.', languageStep: 'اختر اللغة', connectionStep: 'اختر المضيف', projectStep: 'إعداد المشروع', finish: 'فتح مركز التحكم' } }) },
  'pt-BR': { label: 'Portuguese', nativeLabel: 'Português (Brasil)', direction: 'ltr', messages: merge({ navigation: { dashboard: 'Visão geral', instances: 'Serviços WLS', websites: 'Sites', sites: 'Domínios e TLS', console: 'Console', panel: 'Painel WLS', updates: 'Atualizações', settings: 'Configurações' }, common: { online: 'Online', offline: 'Offline', running: 'Em execução', stopped: 'Parado', loading: 'Carregando', refresh: 'Atualizar', save: 'Salvar', start: 'Iniciar', stop: 'Parar', restart: 'Reiniciar', reload: 'Recarregar', cancel: 'Cancelar', continue: 'Continuar', back: 'Voltar', noData: 'Sem dados', copy: 'Copiar', open: 'Abrir' }, dashboard: { title: 'Tudo do WLS em um só olhar.', subtitle: 'Inicie serviços, veja processos e monitore o host em uma única tela.' }, settings: { title: 'Configurações', language: 'Idioma da interface' }, setup: { title: 'Coloque seu host Weline à vista.', languageStep: 'Escolher idioma', connectionStep: 'Escolher host', projectStep: 'Configurar projeto', finish: 'Abrir central de controle' } }) },
  fr: { label: 'French', nativeLabel: 'Français', direction: 'ltr', messages: merge({ navigation: { dashboard: 'Vue d’ensemble', instances: 'Services WLS', websites: 'Sites', sites: 'Domaines et TLS', console: 'Console', panel: 'Panneau WLS', updates: 'Mises à jour', settings: 'Réglages' }, common: { online: 'En ligne', offline: 'Hors ligne', running: 'Actif', stopped: 'Arrêté', loading: 'Chargement', refresh: 'Actualiser', save: 'Enregistrer', start: 'Démarrer', stop: 'Arrêter', restart: 'Redémarrer', reload: 'Recharger', cancel: 'Annuler', continue: 'Continuer', back: 'Retour', noData: 'Aucune donnée', copy: 'Copier', open: 'Ouvrir' }, dashboard: { title: 'Tout WLS en un coup d’œil.', subtitle: 'Démarrez les services, inspectez les processus et surveillez l’hôte depuis une seule vue.' }, settings: { title: 'Réglages', language: 'Langue de l’interface' }, setup: { title: 'Gardez votre hôte Weline en vue.', languageStep: 'Choisir la langue', connectionStep: 'Choisir l’hôte', projectStep: 'Configurer le projet', finish: 'Ouvrir le centre de contrôle' } }) },
  de: { label: 'German', nativeLabel: 'Deutsch', direction: 'ltr', messages: merge({ navigation: { dashboard: 'Übersicht', instances: 'WLS-Dienste', websites: 'Websites', sites: 'Domains & TLS', console: 'Konsole', panel: 'WLS-Panel', updates: 'Updates', settings: 'Einstellungen' }, common: { online: 'Online', offline: 'Offline', running: 'Läuft', stopped: 'Gestoppt', loading: 'Lädt', refresh: 'Aktualisieren', save: 'Speichern', start: 'Starten', stop: 'Stoppen', restart: 'Neustart', reload: 'Neu laden', cancel: 'Abbrechen', continue: 'Weiter', back: 'Zurück', noData: 'Keine Daten', copy: 'Kopieren', open: 'Öffnen' }, dashboard: { title: 'Alles für WLS auf einen Blick.', subtitle: 'Dienste starten, Prozesse prüfen und den Host zentral überwachen.' }, settings: { title: 'Einstellungen', language: 'Oberflächensprache' }, setup: { title: 'Behalten Sie Ihren Weline-Host im Blick.', languageStep: 'Sprache wählen', connectionStep: 'Host wählen', projectStep: 'Projekt einrichten', finish: 'Kontrollzentrum öffnen' } }) },
  ja: { label: 'Japanese', nativeLabel: '日本語', direction: 'ltr', messages: merge({ navigation: { dashboard: '概要', instances: 'WLS サービス', websites: 'サイト', sites: 'ドメインとTLS', console: 'コマンド', panel: 'WLS パネル', updates: 'アップデート', settings: '設定' }, common: { online: 'オンライン', offline: 'オフライン', running: '実行中', stopped: '停止', loading: '読み込み中', refresh: '更新', save: '設定を保存', start: '開始', stop: '停止', restart: '再起動', reload: 'ホットリロード', cancel: 'キャンセル', continue: '続行', back: '戻る', noData: 'データなし', copy: 'コピー', open: '開く' }, dashboard: { title: 'WLS のすべてを一目で。', subtitle: 'サービスの起動、プロセス確認、ホスト監視を一つの画面で。' }, settings: { title: '設定', language: '表示言語' }, setup: { title: 'Weline ホストを見える化します。', languageStep: '言語を選択', connectionStep: 'ホストを選択', projectStep: 'プロジェクト設定', finish: 'コントロールセンターを開く' } }) },
  ko: { label: 'Korean', nativeLabel: '한국어', direction: 'ltr', messages: merge({ navigation: { dashboard: '개요', instances: 'WLS 서비스', websites: '웹사이트', sites: '도메인 및 TLS', console: '명령 콘솔', panel: 'WLS 패널', updates: '업데이트', settings: '설정' }, common: { online: '온라인', offline: '오프라인', running: '실행 중', stopped: '중지됨', loading: '불러오는 중', refresh: '새로고침', save: '설정 저장', start: '시작', stop: '중지', restart: '재시작', reload: '핫 리로드', cancel: '취소', continue: '계속', back: '뒤로', noData: '데이터 없음', copy: '복사', open: '열기' }, dashboard: { title: 'WLS 상태를 한눈에.', subtitle: '한 화면에서 서비스를 시작하고 프로세스와 호스트 성능을 확인하세요.' }, settings: { title: '설정', language: '인터페이스 언어' }, setup: { title: 'Weline 호스트를 한눈에 관리하세요.', languageStep: '언어 선택', connectionStep: '호스트 선택', projectStep: '프로젝트 구성', finish: '제어 센터 열기' } }) },
};

export function normalizeLocale(value: string): string {
  const exact = Object.keys(localeCatalog).find((locale) => locale.toLowerCase() === value.toLowerCase());
  if (exact) return exact;
  const language = value.split('-')[0].toLowerCase();
  return Object.keys(localeCatalog).find((locale) => locale.split('-')[0].toLowerCase() === language) ?? 'en';
}
