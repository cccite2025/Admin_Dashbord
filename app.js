// -----------------------------------------------------------------
// APPLICATION FILE (app.js)
// -----------------------------------------------------------------
// นี่คือไฟล์ JavaScript หลักที่ควบคุมตรรกะทั้งหมด
// -----------------------------------------------------------------

// 1. Import การตั้งค่าทั้งหมดจาก config.js
import * as config from './config.js';

// 2. Initial setup
const { createClient } = supabase;
const supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

let currentRole = 'admin';
let projects = [];
let editingProject = null;
let fileInputs = {};
let searchTerm = '';

let allEmployees = [];
let allLocations = [];

// -----------------------------------------------------------------
// 3. Helper Functions (UI)
// -----------------------------------------------------------------
function showLoading() { document.getElementById('loading').style.display = 'block'; }
function hideLoading() { document.getElementById('loading').style.display = 'none'; }

function showError(msg) {
    const el = document.getElementById('error');
    el.textContent = `ข้อผิดพลาด: ${msg}`;
    el.style.display = 'block';
    // ⭐️ V 2.2: ใช้ .scrollIntoView() เพื่อให้แน่ใจว่าผู้ใช้เห็นข้อผิดพลาด
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el.style.display = 'none', 7000);
}

// -----------------------------------------------------------------
// 4. Supabase/Data Functions
// -----------------------------------------------------------------

/**
 * ⭐️ V 2.2: (แก้ไข) อัปเดต Query ใน fetchProjects
 * เพื่อดึงข้อมูล "ชื่อผู้กรอก" ที่เพิ่มมาใหม่ (DesignOwner, BiddingOwner, PMOwner)
 */
async function fetchProjects() {
    showLoading();
    
    // ⭐️ V 2.3: อัปเดตการ Join ทั้งหมดให้ใช้ "ชื่อ Constraint"
    const { data, error } = await supabaseClient
        .from(config.PROJECT_TABLE)
        .select(`
            *,
            Location:Location!Projects_location_id_fkey (id, site_name),
            Surveyor:Employees!Projects_survey_by_id_fkey (EmployeeID, FirstName, LastName),
            ProjectManager:Employees!Projects_project_manager_id_fkey (EmployeeID, FirstName, LastName),
            DesignOwner:Employees!Projects_design_owner_id_fkey (EmployeeID, FirstName, LastName),
            BiddingOwner:Employees!Projects_bidding_owner_id_fkey (EmployeeID, FirstName, LastName),
            PMOwner:Employees!Projects_pm_owenr_id_fkey (EmployeeID, FirstName, LastName)
        `)
        .order('id', { ascending: false });

    if (error) {
        showError(`ไม่สามารถดึงข้อมูลโปรเจกต์ได้: ${error.message}`);
        console.error(error); // เราจะยัง log error ไว้ เผื่อมีปัญหาอื่น
        projects = [];
    } else {
        projects = data || [];
        console.log('โหลดโปรเจกต์สำเร็จ', projects);
    }
    renderUI();
    hideLoading();
}

async function loadDropdownData() {
    try {
        const [employeeRes, locationRes] = await Promise.all([
            supabaseClient.from(config.EMPLOYEE_TABLE).select('EmployeeID, FirstName, LastName'),
            supabaseClient.from(config.LOCATION_TABLE).select('id, site_name')
        ]);

        if (employeeRes.error) throw employeeRes.error;
        if (locationRes.error) throw locationRes.error;

        allEmployees = employeeRes.data.sort((a, b) => a.FirstName.localeCompare(b.FirstName));
        allLocations = locationRes.data.sort((a, b) => a.site_name.localeCompare(b.site_name));
        
        console.log('โหลดข้อมูล Dropdowns สำเร็จ', { allEmployees, allLocations });
    } catch (error) {
        showError(`ไม่สามารถโหลดข้อมูล Dropdown ได้: ${error.message}`);
        console.error(error);
    }
}

async function uploadFile(file, projectName) {
    if (!file) return null;
    const sanitize = (name) => {
        if (typeof name !== 'string') return '';
        return name.replace(/[^a-zA-Z0-9-_\.]/g, '_');
    };
    const safeProjectName = sanitize(projectName);
    const safeFileName = sanitize(file.name);
    const filePath = `${safeProjectName}/${safeFileName}`;
    
    const { data, error } = await supabaseClient.storage.from(config.BUCKET_NAME).upload(filePath, file, { upsert: true });
    if (error) {
        console.error("Supabase upload error:", error);
        throw new Error(`Upload failed: ${error.message}`);
    }
    const { data: publicURLData } = supabaseClient.storage.from(config.BUCKET_NAME).getPublicUrl(filePath);
    return publicURLData.publicUrl;
}

/**
 * ⭐️ V 2.2: (แก้ไข) อัปเดต handleSave
 * เพื่อรองรับการอ่านค่าจาก Checkbox และการตรวจสอบ (Validation)
 */
async function handleSave(isCompletingProject = false) {
    const form = document.getElementById('formFields');
    const dataToUpdate = {};
    let hasError = false;

    const isNewProject = !editingProject;
    const currentFields = config.fieldsByTeam[currentRole];

    // --- Read data from form ---
    currentFields.forEach(field => {
        const input = form.querySelector(`#${field.name}`);
        if (!input) return;

        let value = null;
        
        // ⭐️ V 2.2: (ฟีเจอร์ 1) เพิ่ม Logic การอ่านค่า Checkbox
        if (field.type === 'checkbox') {
            value = input.checked;
        } else if (field.type === 'file') {
            // File logic อยู่ด้านล่าง
        } else if (field.type === 'select') {
            value = input.value ? (field.source ? parseInt(input.value) : input.value) : null;
        } else {
            value = input.value ? (field.type === 'number' ? parseFloat(input.value) : input.value) : null;
        }
        
        if (field.type !== 'file') {
            dataToUpdate[field.name] = value;
        }
        
        // --- Validation ---
        if (field.required && !input.value && (!editingProject || !editingProject[field.name])) {
            showError(`กรุณากรอกข้อมูลในช่อง "${field.label.split('(')[0].trim()}"`);
            hasError = true;
        }
    });

    // ⭐️ V 2.2: (ฟีเจอร์ 1) ตรวจสอบ Checkbox ของทีม Survey
    if (currentRole === 'survey') {
        const { workScopeDesign, workScopeBidding, workScopePM } = dataToUpdate;
        if (!workScopeDesign && !workScopeBidding && !workScopePM) {
            showError('กรุณาเลือกขอบเขตงานอย่างน้อย 1 รายการ');
            hasError = true;
        }
    }

    if (hasError && (isCompletingProject || isNewProject)) return;
    
    showLoading();
    try {
        let projectData = isNewProject ? {} : { ...editingProject };
        
        // ลบ object ที่ join มา ออกก่อนอัปเดต
        delete projectData.Location;
        delete projectData.Surveyor;
        delete projectData.ProjectManager;
        delete projectData.DesignOwner;
        delete projectData.BiddingOwner;
        delete projectData.PMOwner;
        
        Object.assign(projectData, dataToUpdate);

        const projectName = isNewProject ? projectData.projectName : (editingProject.projectName || projectData.projectName);
        if (!projectName) {
            showError(`ไม่สามารถหาชื่อโครงการได้`);
            hideLoading();
            return;
        }
        
        // --- Handle File Uploads ---
        for (const field of currentFields) {
            if (field.type === 'file') {
                if (fileInputs[field.name]) {
                    projectData[field.name] = await uploadFile(fileInputs[field.name], projectName);
                } else if (editingProject && editingProject[field.name] === null) {
                    projectData[field.name] = null;
                }
            }
        }
        
        // --- Handle Status Transitions ---
        if (currentRole !== 'admin') {
            const currentStatus = projectData.status || 'design';
            const requiredFieldsForRoleAreComplete = (role, pData) => {
                return config.fieldsByTeam[role].filter(f => f.required).every(f => !!pData[f.name]);
            };
            
            if (currentRole === 'survey' && requiredFieldsForRoleAreComplete('survey', projectData)) {
                projectData.status = 'design';
            }
            else if (currentStatus === 'design' && requiredFieldsForRoleAreComplete('design', projectData)) {
                projectData.status = 'bidding';
            } else if (currentStatus === 'bidding' && requiredFieldsForRoleAreComplete('bidding', projectData)) {
                projectData.status = 'pm';
            } else if (currentStatus === 'pm' && isCompletingProject) {
                if (requiredFieldsForRoleAreComplete('pm', projectData)) {
                    if (confirm('คุณกำลังจะปิดโครงการนี้ โครงการจะถูกล็อคและไม่สามารถแก้ไขได้อีก ยืนยันหรือไม่?')) {
                        projectData.status = 'closed';
                    } else {
                        hideLoading(); return;
                    }
                } else {
                    showError('กรุณากรอกข้อมูลที่จำเป็น (*) ให้ครบถ้วนก่อนปิดโครงการ');
                    hideLoading(); return;
                }
            }
        }

        // --- Save to Supabase ---
        let result;
        if (isNewProject) {
            projectData.status = projectData.status || 'design';
            result = await supabaseClient.from(config.PROJECT_TABLE).insert([projectData]).select();
        } else {
            result = await supabaseClient.from(config.PROJECT_TABLE).update(projectData).eq('id', editingProject.id).select();
        }

        if (result.error) {
            showError(`การบันทึกข้อมูลล้มเหลว: ${result.error.message}`);
        } else {
            toggleForm(null, true);
            await fetchProjects(); // Re-fetch all data
        }

    } catch (err) {
        showError(err.message);
    } finally {
        hideLoading();
    }
}

async function deleteProject(id) {
    const project = projects.find(p => p.id === id);
    if (project && project.status === 'closed') {
        alert('ไม่สามารถลบโครงการที่ปิดไปแล้วได้');
        return;
    }

    if (currentRole === 'admin') {
        const password = prompt("กรุณาใส่รหัสผ่านเพื่อยืนยันการลบ:");
        if (password !== '11111') {
            if (password !== null) alert("รหัสผ่านไม่ถูกต้อง!");
            return;
        }
    }

    if (!confirm('ยืนยันการลบโครงการนี้อีกครั้ง? ข้อมูลทั้งหมดจะหายไปอย่างถาวร')) return;
    
    showLoading();
    try {
        const { error } = await supabaseClient.from(config.PROJECT_TABLE).delete().eq('id', id);
        if (error) {
            showError(`การลบข้อมูลล้มเหลว: ${error.message}`);
        } else {
            await fetchProjects();
        }
    } catch (e) {
        showError(e.message);
    } finally {
        hideLoading();
    }
}

// -----------------------------------------------------------------
// 5. Render Functions (HTML Generation)
// -----------------------------------------------------------------

function renderUI() {
    // ⭐️ V 2.5: (จุดที่แก้ไข) เปลี่ยนจาก querySelector เป็น getElementById
    const addBtnContainer = document.getElementById('addBtnContainer');
    
    addBtnContainer.style.display = (currentRole === 'admin' || currentRole === 'survey') ? 'block' : 'none';
    
    const searchContainer = document.getElementById('admin-search-container');
    searchContainer.style.display = currentRole === 'admin' ? 'flex' : 'none';
    document.getElementById('roleSelect').value = currentRole;
    renderTable();
}

/**
 * ⭐️ V 2.2: (แก้ไข) อัปเดต renderForm
 * เพื่อรองรับการสร้าง 'checkbox' และ 'select' จาก 'options'
 */
function renderForm() {
    const formFieldsEl = document.getElementById('formFields');
    const fields = config.fieldsByTeam[currentRole];
    formFieldsEl.innerHTML = ''; // Clear

    // --- (แก้ปัญหา 1) แสดงชื่อ/สถานที่แบบ Read-only สำหรับทีมอื่นๆ ---
    if (editingProject && (currentRole === 'design' || currentRole === 'bidding' || currentRole === 'pm')) {
        formFieldsEl.innerHTML += `
            <div class="form-group">
                <label>ชื่อโครงการ</label>
                <input type="text" value="${editingProject.projectName || ''}" readonly style="background:#eeeeee;">
            </div>`;
        
        const locationName = editingProject.Location ? editingProject.Location.site_name : (editingProject.location_id ? 'กำลังโหลด...' : '-');
        formFieldsEl.innerHTML += `
            <div class="form-group">
                <label>สถานที่</label>
                <input type="text" value="${locationName}" readonly style="background:#eeeeee;">
            </div>`;
    }

    // ⭐️ V 2.2: (ฟีเจอร์ 1) Logic สำหรับจัดกลุ่ม Checkbox
    let currentCheckboxGroup = null;
    let groupWrapper = null;

    fields.forEach(field => {
        // --- (ฟีเจอร์ 1) Checkbox Grouping ---
        if (field.type === 'checkbox' && field.group) {
            if (field.group !== currentCheckboxGroup) {
                // เริ่มกลุ่มใหม่
                currentCheckboxGroup = field.group;
                groupWrapper = document.createElement('div');
                groupWrapper.className = 'form-group-checkbox';
                
                const groupLabel = document.createElement('label');
                groupLabel.className = 'form-group-checkbox-label';
                groupLabel.textContent = 'ขอบเขตงาน (เลือกอย่างน้อย 1 รายการ) *';
                groupWrapper.appendChild(groupLabel);
                
                formFieldsEl.appendChild(groupWrapper);
            }
        } else {
            // ถ้าไม่ใช่ checkbox group ให้ปิด group
            groupWrapper = null;
            currentCheckboxGroup = null;
        }

        // --- สร้าง Field ---
        let fieldHtml = '';
        const value = (editingProject && editingProject[field.name] != null) ? editingProject[field.name] : '';

        if (field.type === 'select') {
            fieldHtml = `<select id="${field.name}" name="${field.name}">
                            <option value="">--- เลือก${field.label.split('(')[0].trim()} ---</option>`;
            
            // ⭐️ V 2.2: (ฟีเจอร์ 1) สร้าง select จาก 'options' (ถ้ามี)
            if (field.options) {
                field.options.forEach(opt => {
                    fieldHtml += `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`;
                });
            
            // สร้าง select จาก 'source' (แบบเดิม)
            } else if (field.source) {
                const dataSource = (field.source === 'employees') ? allEmployees : allLocations;
                dataSource.forEach(item => {
                    const id = item.EmployeeID || item.id;
                    const name = item.site_name || `${item.FirstName} ${item.LastName || ''}`.trim();
                    fieldHtml += `<option value="${id}" ${value == id ? 'selected' : ''}>${name}</option>`;
                });
            }
            fieldHtml += `</select>`;

        // ⭐️ V 2.2: (ฟีเจอร์ 1) สร้าง Checkbox
        } else if (field.type === 'checkbox') {
            const checked = (editingProject && editingProject[field.name]) ? 'checked' : '';
            const optionWrapper = document.createElement('div');
            optionWrapper.className = 'checkbox-option';
            optionWrapper.innerHTML = `
                <input type="checkbox" id="${field.name}" name="${field.name}" ${checked}>
                <label for="${field.name}">${field.label}</label>
            `;
            // เพิ่มลงใน groupWrapper ถ้ามี, หรือสร้าง form-group ใหม่ถ้าไม่มี
            if (groupWrapper) {
                groupWrapper.appendChild(optionWrapper);
                return; // ข้ามการสร้าง form-group ปกติ
            } else {
                fieldHtml = optionWrapper.innerHTML; // สำหรับ checkbox เดี่ยว (เช่น ใน admin)
            }

        } else if (field.type === 'file') {
            fieldHtml = `<input type="file" id="${field.name}" name="${field.name}" accept="${field.accept || ''}">`;
            if (editingProject && editingProject[field.name]) {
                fieldHtml += `
                    <div style="margin-top: 0.5rem;">
                        <a href="${editingProject[field.name]}" target="_blank" class="file-link">ดูไฟล์ปัจจุบัน</a>
                        <button type="button" class="btn-delete-file" onclick="window.App.removeFile('${field.name}')">ลบไฟล์</button>
                    </div>`;
            }

        } else { // Text, Number, Date
            const readonly = (field.name === 'projectName' && editingProject && currentRole !== 'admin' && currentRole !== 'survey') ? 'readonly style="background:#eeeeee;"' : '';
            fieldHtml = `<input type="${field.type}" id="${field.name}" name="${field.name}" value="${value}" ${readonly}>`;
        }

        const group = document.createElement('div');
        group.className = 'form-group';
        group.innerHTML = `<label for="${field.name}">${field.label}${field.required ? ' *' : ''}</label>${fieldHtml}`;
        formFieldsEl.appendChild(group);

        // ⭐️⭐️⭐️ [START] นี่คือโค้ดที่แก้ไขปัญหาไฟล์อัปโหลด ⭐️⭐️⭐️
        // เพิ่ม Event Listener ทันทีหลังจากสร้าง HTML
        if (field.type === 'file') {
            const fileInput = group.querySelector(`#${field.name}`);
            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        // เก็บไฟล์ที่เลือกไว้ในตัวแปร fileInputs
                        fileInputs[field.name] = e.target.files[0];
                        console.log(`ไฟล์ ${field.name} ถูกเลือก:`, fileInputs[field.name].name);
                    } else {
                        // ถ้าผู้ใช้กดยกเลิก
                        delete fileInputs[field.name];
                    }
                });
            }
        }
        // ⭐️⭐️⭐️ [END] สิ้นสุดโค้ดที่แก้ไข ⭐️⭐️⭐️

    });
}


function renderTable() {
    let projectsToDisplay;

    if (currentRole === 'admin') {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        projectsToDisplay = searchTerm
            ? projects.filter(p => p.projectName && p.projectName.toLowerCase().includes(lowerCaseSearchTerm))
            : projects;
    } else {
         // ⭐️ V 2.2: (แก้ปัญหา 3) ทีม Survey จะเห็นเฉพาะโปรเจกต์ที่ตัวเองสร้าง
         // (ส่วนนี้โค้ดของคุณมี else ซ้อนกันแปลกๆ ผมขออนุญาตจัดให้ใหม่นะครับ)
         
         if (currentRole === 'survey') {
             // Logic เดิมคือให้ survey เห็นเฉพาะ status 'survey'
             // แต่ตอนนี้เราไม่มี status 'survey'
             // ผมจะปรับเป็นให้ survey เห็น 'design' (งานที่ตัวเองเพิ่งส่งไป)
             // หรือถ้าจะให้เห็นงานที่ตัวเองสร้างทั้งหมด (ทุก status) ก็ทำได้
             // แต่ logic ที่ตรงกับ "งานของทีมสำรวจ" ที่สุด คือ "งานที่ต้องดำเนินการ" = 0
             
             // เอาตาม logic เดิมของทีมอื่น: ทีมอื่นจะเห็นเฉพาะ status ของตัวเอง
             projectsToDisplay = projects.filter(p => p.status === currentRole);
             
             // *** หมายเหตุ: ถ้าคุณอยากให้ทีม Survey เห็น "ทุกโปรเจกต์" ที่มี status เป็น 'design' (เพิ่งสร้างเสร็จ)
             // *** ให้แก้บรรทัดบนเป็น:
             // projectsToDisplay = projects.filter(p => p.status === 'design');
             
         } else {
              projectsToDisplay = projects.filter(p => p.status === currentRole);
         }
    }

    // ⭐️ V 2.4: (จุดที่แก้ไข) แก้ไขไวยากรณ์ของตัวแปร title ให้ถูกต้อง
    const title = currentRole === 'admin'
        ? `โครงการทั้งหมด (${projectsToDisplay.length})`
        : (currentRole === 'survey'
            ? `งานของทีมสำรวจ` // <-- แก้ไขจุดที่ 1 (เอาข้อความออก)
            : `งานที่ต้องดำเนินการ (${projectsToDisplay.length})`);
            
    document.getElementById('table-title').textContent = title;
    
    if (projectsToDisplay.length === 0) {
        const emptyMessage = searchTerm
            ? `ไม่พบโครงการที่ชื่อตรงกับ "${searchTerm}"`
            : (currentRole === 'admin' ? 'ไม่มีข้อมูลโครงการ' : (currentRole === 'survey' ? 'กด "เพิ่มโครงการใหม่" เพื่อเริ่ม' : 'ไม่มีงานที่ต้องดำเนินการ'));
        document.getElementById('tableContent').innerHTML = `<div class="empty">${emptyMessage}</div>`;
        return;
    }

    if (currentRole === 'admin') {
        renderAdminTable(projectsToDisplay);
    } else {
        renderTeamTable(projectsToDisplay);
    }
}


/**
 * ⭐️ V 2.2: (แก้ไข) อัปเดต renderAdminTable
 * เพิ่ม helper Geters และแสดงผลข้อมูลใหม่ใน Details Grid
 */

// --- Geters สำหรับชื่อที่ Join มา ---
const getEmployeeName = (empObj) => empObj ? `${empObj.FirstName} ${empObj.LastName || ''}`.trim() : '-';
const getPM = (p) => getEmployeeName(p.ProjectManager);
const getSurveyor = (p) => getEmployeeName(p.Surveyor);
const getLocation = (p) => p.Location ? p.Location.site_name : '-';
const getDesignOwner = (p) => getEmployeeName(p.DesignOwner);
const getBiddingOwner = (p) => getEmployeeName(p.BiddingOwner);
const getPMOwner = (p) => getEmployeeName(p.PMOwner);

function renderAdminTable(projectsToDisplay) {
    const tableContentEl = document.getElementById('tableContent');
    let html = `<table><thead><tr>
        <th>ชื่อโครงการ</th><th>สถานะ</th><th>ผู้จัดการ</th><th>จัดการ</th>
    </tr></thead><tbody>`;

    projectsToDisplay.forEach(project => {
        const escapedProject = JSON.stringify(project).replace(/"/g, '&quot;');
        const isClosed = project.status === 'closed';
        const statusText = config.statusMap[project.status] || project.status || 'N/A';
        
        let actionButtons = '';
        if (!isClosed) {
            actionButtons = `
                <button class="btn btn-simple-action" onclick="event.stopPropagation(); window.App.toggleForm(${escapedProject})">แก้ไข</button>
                <button class="btn btn-simple-delete" onclick="event.stopPropagation(); window.App.deleteProject(${project.id})">ลบ</button>
            `;
        } else {
             actionButtons = `
                <button class="btn btn-simple-action" onclick="event.stopPropagation(); window.App.toggleForm(${escapedProject})" disabled>ดู</button>
            `;
        }

        // ⭐️ V 2.2: (ฟีเจอร์ 1) สร้าง string สรุปขอบเขตงาน
        const workScopes = [
            project.workScopeDesign ? 'ออกแบบ' : null,
            project.workScopeBidding ? 'ประมูล' : null,
            project.workScopePM ? 'บริหารโครงการ' : null
        ].filter(Boolean).join(', ') || '-';

        // ⭐️ V 2.2: (ฟีเจอร์ 1 & 2) เพิ่ม Field ใหม่ใน Details Grid
        html += `
            <tr class="project-summary-row" onclick="window.App.toggleDetails(${project.id})">
                <td><strong>${project.projectName || '-'}</strong></td>
                <td>${statusText}</td>
                <td>${getPM(project)}</td>
                <td class="action-buttons">
                    ${actionButtons}
                </td>
            </tr>
            <tr class="project-details-row" id="details-${project.id}" style="display: none;">
                <td colspan="4">
                    <div class="details-grid">
                        <p><strong>ID:</strong> ${project.id}</p>
                        <p><strong>ผู้จัดการ:</strong> ${getPM(project)}</p>
                        <p><strong>สถานที่:</strong> ${getLocation(project)}</p>
                        <p><strong>งบประมาณ:</strong> ${project.budget ? project.budget.toLocaleString('th-TH') : '-'}</p>
                        <p><strong>ราคาก่อสร้างจริง:</strong> ${project.actualCost ? project.actualCost.toLocaleString('th-TH') : '-'}</p>
                        
                        <p><strong>ประเภทก่อสร้าง:</strong> ${project.constructionType || '-'}</p>
                        <p><strong>ขอบเขตงาน:</strong> ${workScopes}</p>
                        
                        <p><strong>ผู้กรอก (สำรวจ):</strong> ${getSurveyor(project)}</p>
                        <p><strong>ผู้กรอก (ออกแบบ):</strong> ${getDesignOwner(project)}</p>
                        <p><strong>ผู้กรอก (ประมูล):</strong> ${getBiddingOwner(project)}</p>
                        <p><strong>ผู้กรอก (PM):</strong> ${getPMOwner(project)}</p>
                        
                        <p><strong>วันเริ่มงาน:</strong> ${project.startDate || '-'}</p>
                        <p><strong>ระยะเวลาตามแผน:</strong> ${project.plannedDuration || '-'} วัน</p>
                        <p><strong>ระยะเวลาจริง:</strong> ${project.actualDuration || '-'} วัน</p>
                        <div><strong>ไฟล์:</strong>
                            ${project.biddingPDF ? `<a href="${project.biddingPDF}" target="_blank" class="file-link">แบบประมูล</a>` : ''}
                            ${project.constructionPDF ? `<a href="${project.constructionPDF}" target="_blank" class="file-link">แบบก่อสร้าง</a>` : ''}
                            ${project.rvtModel ? `<a href="${project.rvtModel}" target="_blank" class="file-link">โมเดล RVT</a>` : ''}
                            ${project.ifcModel ? `<a href="${project.ifcModel}" target="_blank" class="file-link">โมเดล IFC</a>` : ''}
                            ${project.boqPDF ? `<a href="${project.boqPDF}" target="_blank" class="file-link">BOQ</a>` : ''}
                            ${project.projectImage ? `<a href="${project.projectImage}" target="_blank" class="file-link">รูปภาพ</a>` : ''}
                            ${project.asBuiltPDF ? `<a href="${project.asBuiltPDF}" target="_blank" class="file-link">As-Built</a>` : ''}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    tableContentEl.innerHTML = html;
}

function renderTeamTable(projectsToDisplay) {
    const tableContentEl = document.getElementById('tableContent');
    // ⭐️ V 2.2: (ฟีเจอร์ 2) เพิ่มคอลัมน์ "ผู้ส่งเรื่อง" (Submitter)
    // โดยจะแสดงผู้รับผิดชอบจาก "ทีมก่อนหน้า"
    
    let submitterHeader = "ผู้ส่งเรื่อง";
    if (currentRole === 'design') submitterHeader = 'ผู้สำรวจ';
    if (currentRole === 'bidding') submitterHeader = 'ผู้ออกแบบ';
    if (currentRole === 'pm') submitterHeader = 'ผู้ประมูล';

    let html = `<table><thead><tr>
        <th>ชื่อโครงการ</th>
        <th>${submitterHeader}</th>
        <th>ผู้จัดการ</th>
        <th>ไฟล์</th>
        <th>จัดการ</th>
    </tr></thead><tbody>`;
    
    projectsToDisplay.forEach(project => {
        let fileLinks = '';
        if (project.biddingPDF) fileLinks += `<a href="${project.biddingPDF}" target="_blank" class="file-link">แบบประมูล</a>`;
        if (project.constructionPDF) fileLinks += `<a href="${project.constructionPDF}" target="_blank" class="file-link">แบบก่อสร้าง</a>`;
        if (project.rvtModel) fileLinks += `<a href="${project.rvtModel}" target="_blank" class="file-link">โมเดล RVT</a>`;
        if (project.ifcModel) fileLinks += `<a href="${project.ifcModel}" target="_blank" class="file-link">โมเดล IFC</a>`;
        if (project.boqPDF) fileLinks += `<a href="${project.boqPDF}" target="_blank" class="file-link">BOQ</a>`;
        if (project.projectImage) fileLinks += `<a href="${project.projectImage}" target="_blank" class="file-link">รูปภาพ</a>`;
        if (project.asBuiltPDF) fileLinks += `<a href="${project.asBuiltPDF}" target="_blank" class="file-link">As-Built</a>`;

        const isClosed = project.status === 'closed';
        
        // ⭐️ V 2.2: (ฟีเจอร์ 2) หาชื่อผู้ส่งเรื่องตาม Role
        let submitterName = '-';
        if (currentRole === 'design') submitterName = getSurveyor(project);
        if (currentRole === 'bidding') submitterName = getDesignOwner(project);
        if (currentRole === 'pm') submitterName = getBiddingOwner(project);

        html += `<tr>
            <td><strong>${project.projectName || '-'}</strong></td>
            <td>${submitterName}</td>
            <td>${getPM(project)}</td>
            <td>${fileLinks || '-'}</td>
            <td class="action-buttons">
                <button class="btn btn-simple-action" onclick="window.App.toggleForm(${JSON.stringify(project).replace(/"/g, '&quot;')})" ${isClosed ? 'disabled' : ''}>${isClosed ? 'ดู' : 'ดำเนินการ'}</button>
            </td>
        </tr>`;
    });
    html += `</tbody></table>`;
    tableContentEl.innerHTML = html;
}

// -----------------------------------------------------------------
// 6. Event Handlers & Global Exports
// -----------------------------------------------------------------

function changeRole(role) {
    currentRole = role;
    clearSearch();
    toggleForm(null, true); // Close form on role change
    renderUI();
}

function toggleForm(projectToEdit = null, forceClose = false) {
    if (currentRole === 'admin' && !projectToEdit && !forceClose) {
        const password = prompt("กรุณาใส่รหัสผ่านเพื่อเพิ่มโครงการ:");
        if (password !== '11111') {
            if (password !== null) alert("รหัสผ่านไม่ถูกต้อง!");
            return;
        }
    }
    
    const form = document.getElementById('formContainer');
    
    // ⭐️ V 2.5: (จุดที่แก้ไข) เปลี่ยนจาก querySelector เป็น getElementById
    const addBtnContainer = document.getElementById('addBtnContainer');
    
    const saveBtn = document.getElementById('saveBtn');
    const completeBtn = document.getElementById('completeBtn');
    
    editingProject = projectToEdit ? { ...projectToEdit } : null;
    fileInputs = {};

    if (forceClose) {
        form.style.display = 'none';
        if(addBtnContainer) {
            addBtnContainer.style.display = (currentRole === 'admin' || currentRole === 'survey') ? 'block' : 'none';
        }
        completeBtn.style.display = 'none';
        editingProject = null;
        return;
    }
    
    if (form.style.display === 'none' || projectToEdit) {
        document.getElementById('formTitle').textContent = projectToEdit ? `แก้ไขโครงการ: ${projectToEdit.projectName}` : 'เพิ่มโครงการใหม่';
        if(addBtnContainer) addBtnContainer.style.display = 'none';
        
        if (currentRole === 'pm') {
            saveBtn.innerHTML = 'บันทึก';
            completeBtn.style.display = 'block';
        } else {
            saveBtn.innerHTML = (currentRole === 'admin' || currentRole === 'survey') ? 'บันทึก' : 'บันทึกและส่งต่อ';
            completeBtn.style.display = 'none';
        }
        
        renderForm(); // Re-render form content
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        if(addBtnContainer && (currentRole === 'admin' || currentRole === 'survey')) {
             addBtnContainer.style.display = 'block';
        }
        form.style.display = 'none';
        completeBtn.style.display = 'none';
    }
}

function removeFile(fieldName) {
    if (editingProject) {
        editingProject[fieldName] = null;
        fileInputs[fieldName] = null; // Clear any staged file
        renderForm(); // Re-render the form to show the change
    }
}

function toggleDetails(projectId) {
    const detailsRow = document.getElementById(`details-${projectId}`);
    if (detailsRow) {
        detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    }
}

function handleSearch() {
    searchTerm = document.getElementById('searchInput').value;
    document.getElementById('clearSearchBtn').style.display = searchTerm ? 'inline-block' : 'none';
    renderTable();
}

function clearSearch() {
    searchTerm = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('clearSearchBtn').style.display = 'none';
    renderTable();
}

// -----------------------------------------------------------------
// 7. Initial Load
// -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    await loadDropdownData();
    await fetchProjects();
    hideLoading();
});

// 8. Export functions to global window object (เพื่อให้ HTML onclicks ทำงาน)
// ⭐️ V 2.2: เราจะรวมฟังก์ชันทั้งหมดไว้ใน Object เดียว
window.App = {
    toggleForm,
    saveProject: () => handleSave(false),
    completeProject: () => handleSave(true),
    deleteProject,
    changeRole,
    toggleDetails,
    handleSearch,
    removeFile,
    clearSearch
};