// -----------------------------------------------------------------
// CONFIGURATION FILE (config.js)
// -----------------------------------------------------------------
// ไฟล์นี้เก็บการตั้งค่าทั้งหมดของแอป
// -----------------------------------------------------------------

// 1. Supabase Configuration
export const SUPABASE_URL = 'https://epkyqxohpnrzxnnxxrow.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwa3lxeG9ocG5yenhubnh4cm93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4MDM1NDMsImV4cCI6MjA3NTM3OTU0M30.y3DmBeNyRUwXtLzs6Oh8fT0riAB5-G_-u63RpTleH1s';

// 2. Table and Bucket Names
export const PROJECT_TABLE = 'Projects';
export const EMPLOYEE_TABLE = 'Employees';
export const LOCATION_TABLE = 'Location';
export const BUCKET_NAME = 'project-files';

// 3. Application Mappings and Constants
export const statusMap = {
    design: 'รอทีมออกแบบ',
    bidding: 'รอทีมประมูล',
    pm: 'รอทีมบริหารโครงการ',
    completed: 'เสร็จสิ้น',
    closed: 'โครงการเสร็จสมบูรณ์'
};

export const fileWarning = ' (โปรดตั้งชื่อไฟล์เป็นภาษาอังกฤษ และห้ามมีช่องว่าง)';

// 4. Construction Types
const constructionTypes = [
    'โครงการก่อร้างใหม่',
    'โครงการปรุงงานก่อสร้าง',
    'งานเพิ่ม/ลด จากสัญญาก่อสร้างเดิม'
];

// 5. Fields By Team
// -----------------------------------------------------------------
export const fieldsByTeam = {
    survey: [
        { name: 'projectName', label: 'ชื่อโครงการ', type: 'text', required: true },
        { name: 'location_id', label: 'สถานที่', type: 'select', source: 'locations', required: true },
        { name: 'constructionType', label: 'ประเภทการก่อสร้าง', type: 'select', options: [
            'โครงการก่อร้างใหม่',
            'โครงการปรุงงานก่อสร้าง',
            'งานเพิ่ม/ลด จากสัญญาก่อสร้างเดิม'
        ], required: true },
        { name: 'surveyStartDate', label: 'วันเริ่มงานก่อสร้าง', type: 'date' },
        { name: 'surveyEndDate', label: 'วันจบงานก่อสร้าง', type: 'date' },
        { name: 'plannedDuration', label: 'ระยะเวลาตามแผน (วัน)', type: 'number' },

        { name: 'isBudgetEstimated', label: 'ประเมินงบประมาณ', type: 'checkbox', group: 'workScope' },
        { name: 'workScopeDesign', label: 'งานออกแบบ', type: 'checkbox', group: 'workScope' },
        { name: 'workScopeBidding', label: 'งานประมูล', type: 'checkbox', group: 'workScope' },
        { name: 'workScopePM', label: 'งานบริหารโครงการ', type: 'checkbox', group: 'workScope' },
        
        { name: 'budget', label: 'งบประมาณ', type: 'number' },
        { name: 'survey_by_id', label: 'ชื่อผู้กรอก', type: 'select', source: 'employees', required: true }
    ],
    design: [
        { name: 'design_owner_id', label: 'ชื่อผู้กรอก', type: 'select', source: 'employees', required: true },
        { name: 'project_manager_id', label: 'ผู้บริหารโครงการ', type: 'select', source: 'employees', required: true },
        
        // ⭐️ แก้ไขตรงนี้: เปลี่ยน Requirement เป็นไฟล์ PDF
        { name: 'requirementPDF', label: `รายละเอียดความต้องการ (Requirement) (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        
        { name: 'initialDesignPDF', label: `อัปโหลดแบบขั้นต้น (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'detailedDesignPDF', label: `อัปโหลดแบบรายละเอียด (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'calculationPDF', label: `รายการคำนวณ (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'overlapPDF', label: `พื้นที่ทับซ้อน (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'supportingDocsPDF', label: `เอกสารประกอบต่างๆ (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },

        { name: 'rvtModel', label: `อัปโหลดแบบก่อสร้างสามมิติ (.rvt)${fileWarning}`, type: 'file', accept: '.rvt' },
        { name: 'ifcModel', label: `อัปโหลดโมเดลสามมิติ (.ifc)${fileWarning}`, type: 'file', accept: '.ifc' }
    ],
    bidding: [
        { name: 'bidding_owner_id', label: 'ชื่อผู้กรอก', type: 'select', source: 'employees', required: true },
        { name: 'actualCost', label: 'ราคาก่อสร้างจริง', type: 'number', required: true },
        { name: 'boqPDF', label: `อัปโหลด BOQ (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        
        { name: 'projectImage', label: `รูปภาพโครงการ (3D Render)${fileWarning}`, type: 'file', accept: 'image/*' },
        
        // ข้อ 2: เปลี่ยนจาก ConstructionPDF เป็น BiddingPDF (แบบประมูล)
        { name: 'biddingPDF', label: `อัปโหลดแบบประมูล (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },

        { name: 'clarificationPDF', label: `บันทึกชี้แจงแบบ (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'torPDF', label: `TOR (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'biddingDocsPDF', label: `เอกสารประมูล (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' }
    ],
    pm: [
        { name: 'pm_owenr_id', label: 'ชื่อผู้กรอก', type: 'select', source: 'employees', required: true },
        { name: 'actualDuration', label: 'ระยะเวลาก่อสร้างจริง (วัน)', type: 'number' },
        
        // ข้อ 3: เพิ่มเอกสารใหม่สำหรับ PM
        { name: 'permissionDocsPDF', label: `เอกสารขออนุญาตต่างๆ (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'weeklyReportPDF', label: `รายงานประชุมประจำสัปดาห์ (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'approvalDocsPDF', label: `เอกสารขออนุมัติต่างๆ (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'memoPDF', label: `บันทึกต่างๆ (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'changeOrderPDF', label: `งานเปลี่ยนแปลง/เพิ่มเติม (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'handoverDocsPDF', label: `เอกสารส่งมอบงาน (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'defectChecklistPDF', label: `เอกสารตรวจ Defect ก่อนส่งมอบ (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'weeklySiteImagesPDF', label: `รูปภาพหน้างาน (หน้า/ข้าง/บน) (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },

        { name: 'asBuiltPDF', label: `อัปโหลดแบบ As-Built (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' }
    ],
    admin: [
        { name: 'projectName', label: 'ชื่อโครงการ', type: 'text' },
        { name: 'location_id', label: 'สถานที่', type: 'select', source: 'locations' },
        { name: 'project_manager_id', label: 'ผู้บริหารโครงการ', type: 'select', source: 'employees' },
        { name: 'survey_by_id', label: 'ผู้กรอก (สำรวจ)', type: 'select', source: 'employees' },
        { name: 'design_owner_id', label: 'ผู้กรอก (ออกแบบ)', type: 'select', source: 'employees' },
        { name: 'bidding_owner_id', label: 'ผู้กรอก (ประมูล)', type: 'select', source: 'employees' },
        { name: 'pm_owenr_id', label: 'ผู้กรอก (PM)', type: 'select', source: 'employees' },
        { name: 'budget', label: 'งบประมาณ', type: 'number' },
        { name: 'actualCost', label: 'ราคาก่อสร้างจริง', type: 'number' },
        { name: 'constructionType', label: 'ประเภทการก่อสร้าง', type: 'select', options: [
            'โครงการก่อร้างใหม่',
            'โครงการปรุงงานก่อสร้าง',
            'งานเพิ่ม/ลด จากสัญญาก่อสร้างเดิม'
        ]},
        { name: 'surveyStartDate', label: 'วันเริ่มงานก่อสร้าง', type: 'date' },
        { name: 'surveyEndDate', label: 'วันจบงานก่อสร้าง', type: 'date' },
        { name: 'isBudgetEstimated', label: 'ขอบเขต: ประเมินงบประมาณ', type: 'checkbox' },
        { name: 'workScopeDesign', label: 'ขอบเขต: ออกแบบ', type: 'checkbox' },
        { name: 'workScopeBidding', label: 'ขอบเขต: ประมูล', type: 'checkbox' },
        { name: 'workScopePM', label: 'ขอบเขต: บริหารโครงการ', type: 'checkbox' },
        { name: 'startDate', label: 'วันเริ่มงาน (PM)', type: 'date' },
        { name: 'plannedDuration', label: 'ระยะเวลาตามแผน (วัน)', type: 'number' },
        { name: 'actualDuration', label: 'ระยะเวลาก่อสร้างจริง (วัน)', type: 'number' },

        // Design Fields
        { name: 'requirement', label: 'Requirement', type: 'text' },
        { name: 'initialDesignPDF', label: `แบบขั้นต้น (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'detailedDesignPDF', label: `แบบรายละเอียด (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'calculationPDF', label: `รายการคำนวณ (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'overlapPDF', label: `พื้นที่ทับซ้อน (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'supportingDocsPDF', label: `เอกสารประกอบต่างๆ (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'rvtModel', label: `แบบก่อสร้างสามมิติ (.rvt)`, type: 'file', accept: '.rvt' },
        { name: 'ifcModel', label: `โมเดลสามมิติ (.ifc)`, type: 'file', accept: '.ifc' },
        
        // Bidding Fields
        { name: 'biddingPDF', label: `แบบประมูล (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'clarificationPDF', label: `บันทึกชี้แจงแบบ (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'torPDF', label: `TOR (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'biddingDocsPDF', label: `เอกสารประมูล (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'boqPDF', label: `BOQ (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'projectImage', label: `รูปภาพโครงการ (3D Render)`, type: 'file', accept: 'image/*' },

        // PM Fields (New)
        { name: 'permissionDocsPDF', label: `เอกสารขออนุญาต (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'weeklyReportPDF', label: `รายงานประชุม (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'approvalDocsPDF', label: `เอกสารขออนุมัติ (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'memoPDF', label: `บันทึกต่างๆ (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'changeOrderPDF', label: `งานเปลี่ยนแปลง/เพิ่มเติม (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'handoverDocsPDF', label: `เอกสารส่งมอบงาน (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'defectChecklistPDF', label: `เอกสารตรวจ Defect (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'weeklySiteImagesPDF', label: `รูปภาพหน้างาน (.pdf)`, type: 'file', accept: '.pdf' },
        { name: 'asBuiltPDF', label: `แบบ As-Built (.pdf)`, type: 'file', accept: '.pdf' }
    ]
};