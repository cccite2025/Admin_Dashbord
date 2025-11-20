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
        { name: 'constructionType', label: 'ประเภทการก่อสร้าง', type: 'select', options: constructionTypes, required: true },
        { name: 'surveyStartDate', label: 'วันเริ่มงานก่อสร้าง', type: 'date' },
        { name: 'surveyEndDate', label: 'วันจบงานก่อสร้าง', type: 'date' },

        // ⭐️ 1. เพิ่ม 2 บรรทัดนี้ใน Survey
        { name: 'plannedDuration', label: 'ระยะเวลาตามแผน (วัน)', type: 'number' },


        // ⭐️ V 2.4: ย้าย "ประเมินงบ" มารวมกลุ่ม และเรียงลำดับใหม่
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
        { name: 'biddingPDF', label: `อัปโหลดแบบประมูล (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' }
    ],
    bidding: [
        { name: 'bidding_owner_id', label: 'ชื่อผู้กรอก', type: 'select', source: 'employees', required: true },
        { name: 'actualCost', label: 'ราคาก่อสร้างจริง', type: 'number', required: true },
        { name: 'boqPDF', label: `อัปโหลด BOQ (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'projectImage', label: `อัปโหลดรูปภาพโครงการ${fileWarning}`, type: 'file', accept: 'image/*' },
        { name: 'constructionPDF', label: `อัปโหลดแบบก่อสร้าง (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'rvtModel', label: `อัปโหลดแบบก่อสร้างสามมิติ (.rvt)${fileWarning}`, type: 'file', accept: '.rvt' },
        { name: 'ifcModel', label: `อัปโหลดโมเดลสามมิติ (.ifc)${fileWarning}`, type: 'file', accept: '.ifc' }
    ],
    pm: [
        { name: 'pm_owenr_id', label: 'ชื่อผู้กรอก', type: 'select', source: 'employees', required: true },
        // ⭐️ V 2.4: เอา required: true ออก (เอาดอกจันออก)
        { name: 'actualDuration', label: 'ระยะเวลาก่อสร้างจริง (วัน)', type: 'number' },
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
        
        { name: 'constructionType', label: 'ประเภทการก่อสร้าง', type: 'select', options: constructionTypes },
        
        { name: 'surveyStartDate', label: 'วันเริ่มงานก่อสร้าง', type: 'date' },
        { name: 'surveyEndDate', label: 'วันจบงานก่อสร้าง', type: 'date' },

        // ⭐️ V 2.4: ปรับใน Admin ให้ตรงกับ Survey
        { name: 'isBudgetEstimated', label: 'ขอบเขต: ประเมินงบประมาณ', type: 'checkbox' },
        { name: 'workScopeDesign', label: 'ขอบเขต: ออกแบบ', type: 'checkbox' },
        { name: 'workScopeBidding', label: 'ขอบเขต: ประมูล', type: 'checkbox' },
        { name: 'workScopePM', label: 'ขอบเขต: บริหารโครงการ', type: 'checkbox' },

        { name: 'startDate', label: 'วันเริ่มงาน (PM)', type: 'date' },
        { name: 'plannedDuration', label: 'ระยะเวลาตามแผน (วัน)', type: 'number' },
        { name: 'actualDuration', label: 'ระยะเวลาก่อสร้างจริง (วัน)', type: 'number' },
        { name: 'biddingPDF', label: `แบบประมูล (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'constructionPDF', label: `แบบก่อสร้าง (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'rvtModel', label: `แบบก่อสร้างสามมิติ (.rvt)${fileWarning}`, type: 'file', accept: '.rvt' },
        { name: 'ifcModel', label: `โมเดลสามมิติ (.ifc)${fileWarning}`, type: 'file', accept: '.ifc' },
        { name: 'boqPDF', label: `BOQ (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' },
        { name: 'projectImage', label: `รูปภาพโครงการ${fileWarning}`, type: 'file', accept: 'image/*' },
        { name: 'asBuiltPDF', label: `แบบ As-Built (.pdf)${fileWarning}`, type: 'file', accept: '.pdf' }
    ]
};