export type DriverLanguage = "zh" | "en";

export function getDriverLanguage(profile?: { driver_language?: string | null } | null): DriverLanguage {
  return profile?.driver_language === "en" ? "en" : "zh";
}

type DriverTextKey =
  | "driverApp"
  | "locationUpdating"
  | "waitingForLocation"
  | "staff"
  | "installApp"
  | "installIOS"
  | "installAndroid"
  | "installChrome"
  | "install"
  | "close"
  | "schedule"
  | "route"
  | "noStops"
  | "currentTask"
  | "completed"
  | "upcoming"
  | "manualStep"
  | "eta"
  | "finish"
  | "startTask"
  | "refresh"
  | "notes"
  | "required"
  | "navigate"
  | "loading"
  | "step"
  | "photoUpload"
  | "takePhoto"
  | "uploadFromPhotos"
  | "uploading"
  | "photoUploaded"
  | "tapRetake"
  | "wastePhoto"
  | "takeWastePhoto"
  | "dumpTicketPhoto"
  | "takeDumpTicketPhoto"
  | "scaleTicketPhoto"
  | "takeScaleTicketPhoto"
  | "ticketNumber"
  | "reading"
  | "notRecognized"
  | "recognizedWeight"
  | "type"
  | "ocrWeightMissing"
  | "ocrReviewLater"
  | "newBinPhoto"
  | "takeNewBinPhoto"
  | "oldBinPhoto"
  | "takeOldBinPhoto"
  | "binNumber"
  | "newBinNumber"
  | "oldBinNumber"
  | "dumpSiteName"
  | "weight"
  | "submitting"
  | "completeStep"
  | "stepCompleted"
  | "ticketRecognized"
  | "ticketMissing"
  | "ticketDbMissing"
  | "compressionFailed"
  | "uploaded";

export const driverText: Record<DriverLanguage, Record<DriverTextKey, string>> = {
  zh: {
    driverApp: "司机端",
    locationUpdating: "定位更新中",
    waitingForLocation: "等待定位",
    staff: "后台",
    installApp: "安装司机端",
    installIOS: "在 Safari 点分享，然后选择添加到主屏幕。",
    installAndroid: "从手机桌面打开，会像 App 一样全屏使用。",
    installChrome: "在 Chrome 菜单里选择安装应用或添加到主屏幕。",
    install: "安装",
    close: "关闭",
    schedule: "排班",
    route: "路线",
    noStops: "今天没有分配任务",
    currentTask: "当前任务",
    completed: "已完成",
    upcoming: "待执行",
    manualStep: "手动步骤",
    eta: "预计到达",
    finish: "完成",
    startTask: "开始任务",
    refresh: "刷新",
    notes: "备注",
    required: "需要填写",
    navigate: "打开 Google Maps 导航",
    loading: "加载中...",
    step: "步骤",
    photoUpload: "上传照片",
    takePhoto: "拍照",
    uploadFromPhotos: "从相册/文件上传",
    uploading: "上传中...",
    photoUploaded: "照片已上传",
    tapRetake: "点击重新拍摄",
    wastePhoto: "垃圾照片",
    takeWastePhoto: "拍垃圾照片",
    dumpTicketPhoto: "倒垃圾单照片（可选）",
    takeDumpTicketPhoto: "拍倒垃圾单",
    scaleTicketPhoto: "称重单照片",
    takeScaleTicketPhoto: "拍称重单",
    ticketNumber: "票号",
    reading: "识别中...",
    notRecognized: "未识别",
    recognizedWeight: "识别重量",
    type: "类型",
    ocrWeightMissing: "只识别到了票号，重量可以之后手动填写。",
    ocrReviewLater: "现在可以完成任务，后台之后可以复核。",
    newBinPhoto: "新桶照片",
    takeNewBinPhoto: "拍新桶照片",
    oldBinPhoto: "旧桶照片（可选）",
    takeOldBinPhoto: "拍旧桶照片",
    binNumber: "桶号（可选）",
    newBinNumber: "新桶号（可选）",
    oldBinNumber: "收走的旧桶号（可选）",
    dumpSiteName: "倒垃圾场名称",
    weight: "重量 (kg)",
    submitting: "提交中...",
    completeStep: "完成步骤",
    stepCompleted: "步骤已完成",
    ticketRecognized: "已识别票号",
    ticketMissing: "没有识别出票号，之后可以手动填写。",
    ticketDbMissing: "OCR 已识别，但数据库还没有 ticket_number 字段。",
    compressionFailed: "图片压缩失败，正在上传原图。",
    uploaded: "已上传",
  },
  en: {
    driverApp: "Driver App",
    locationUpdating: "Location updating",
    waitingForLocation: "Waiting for location",
    staff: "Staff",
    installApp: "Install the driver app",
    installIOS: "In Safari, tap Share, then Add to Home Screen.",
    installAndroid: "Open it from your home screen for a full-screen app experience.",
    installChrome: "In Chrome, open the menu and choose Install App or Add to Home Screen.",
    install: "Install",
    close: "Close",
    schedule: "Schedule",
    route: "Route",
    noStops: "No assigned stops today",
    currentTask: "Current task",
    completed: "Completed",
    upcoming: "Upcoming",
    manualStep: "Manual step",
    eta: "ETA",
    finish: "Finish",
    startTask: "Start Task",
    refresh: "Refresh",
    notes: "Notes",
    required: "Required",
    navigate: "Navigate in Google Maps",
    loading: "Loading...",
    step: "Step",
    photoUpload: "Photo upload",
    takePhoto: "Take photo",
    uploadFromPhotos: "Upload from photos/files",
    uploading: "Uploading...",
    photoUploaded: "Photo uploaded",
    tapRetake: "Tap to retake",
    wastePhoto: "Waste photo",
    takeWastePhoto: "Take waste photo",
    dumpTicketPhoto: "Dump ticket photo (optional)",
    takeDumpTicketPhoto: "Take dump ticket photo",
    scaleTicketPhoto: "Scale ticket photo",
    takeScaleTicketPhoto: "Take scale ticket photo",
    ticketNumber: "Ticket number",
    reading: "Reading...",
    notRecognized: "Not recognized",
    recognizedWeight: "Recognized weight",
    type: "Type",
    ocrWeightMissing: "Only the ticket number was recognized. Weight can be entered manually later.",
    ocrReviewLater: "You can finish the task now. Staff can review it later.",
    newBinPhoto: "New bin photo",
    takeNewBinPhoto: "Take new bin photo",
    oldBinPhoto: "Old bin photo (optional)",
    takeOldBinPhoto: "Take old bin photo",
    binNumber: "Bin number (optional)",
    newBinNumber: "New bin number (optional)",
    oldBinNumber: "Old bin number removed (optional)",
    dumpSiteName: "Dump site name",
    weight: "Weight (kg)",
    submitting: "Submitting...",
    completeStep: "Complete Step",
    stepCompleted: "Step completed",
    ticketRecognized: "Ticket recognized",
    ticketMissing: "Ticket number not recognized. It can be entered manually later.",
    ticketDbMissing: "OCR recognized the ticket, but ticket_number is not in the database yet.",
    compressionFailed: "Image compression failed. Uploading original image.",
    uploaded: "Uploaded",
  },
};

export const driverStepTypeLabels: Record<DriverLanguage, Record<string, string>> = {
  zh: {
    pickup_bin: "收桶",
    drop_bin: "送桶",
    dump_waste: "倒垃圾",
    load_material: "装料",
    unload_material: "送料",
    depot_pickup: "场地取货",
    customer_delivery: "送到客户",
    customer_pickup: "客户取回",
    dump_site: "倒垃圾场",
    pickup: "取货",
    delivery: "送货",
    swap: "换桶",
  },
  en: {
    pickup_bin: "Pick up bin",
    drop_bin: "Drop bin",
    dump_waste: "Dump waste",
    load_material: "Load material",
    unload_material: "Deliver material",
    depot_pickup: "Depot pickup",
    customer_delivery: "Customer delivery",
    customer_pickup: "Customer pickup",
    dump_site: "Dump site",
    pickup: "Pickup",
    delivery: "Delivery",
    swap: "Swap bin",
  },
};

export const driverOrderTypeLabels: Record<DriverLanguage, Record<string, string>> = {
  zh: { delivery: "送桶", pickup: "收桶", swap: "换桶", material: "送料" },
  en: { delivery: "Deliver bin", pickup: "Pick up bin", swap: "Swap bin", material: "Material" },
};

export const driverBinTypeNames: Record<DriverLanguage, Record<string, string>> = {
  zh: { garbage: "垃圾桶", brick: "砖桶", soil: "土桶", cement: "水泥桶", asphalt: "沥青桶" },
  en: { garbage: "garbage bin", brick: "brick bin", soil: "soil bin", cement: "cement bin", asphalt: "asphalt bin" },
};
