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
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el.style.display = 'none', 7000);
}

// -----------------------------------------------------------------
// 4. Supabase/Data Functions
// -----------------------------------------------------------------

async function fetchProjects() {
    showLoading();
    
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
        console.error(error);
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
            supabaseClient.from(config.LOCATION_TABLE).select('id, site_name, activity')
        ]);

        if (employeeRes.error) throw employeeRes.error;
        if (locationRes.error) throw locationRes.error;

        allEmployees = employeeRes.data.sort((a, b) => a.FirstName.localeCompare(b.FirstName));
        
        // ⭐️ 2. เริ่มตรรกะจัดการชื่อซ้ำ (Smart Duplicate Handling)
        const rawLocations = locationRes.data;
        
        // ขั้นตอน A: นับจำนวนว่าแต่ละชื่อปรากฏกี่ครั้ง
        const nameCounts = {};
        rawLocations.forEach(loc => {
            const name = loc.site_name || '';
            nameCounts[name] = (nameCounts[name] || 0) + 1;
        });

        // ขั้นตอน B: วนลูปปรับแต่งชื่อ
        allLocations = rawLocations.map(loc => {
            let displayName = loc.site_name;
            
            // เช็คเงื่อนไข: ถ้าชื่อนี้มีมากกว่า 1 รายการ (ซ้ำ) AND มีข้อมูล activity
            if (nameCounts[loc.site_name] > 1 && loc.activity) {
                displayName = `${loc.site_name} (${loc.activity})`;
            }
            
            // ส่งค่ากลับ (ถ้าไม่ซ้ำก็ใช้ชื่อเดิม, ถ้าซ้ำก็ใช้ชื่อที่มีวงเล็บ)
            return {
                ...loc,
                site_name: displayName // อัปเดตตัวแปรนี้เพื่อให้ Dropdown แสดงผลถูกต้องทันที
            };
        }).sort((a, b) => a.site_name.localeCompare(b.site_name)); // เรียงตามตัวอักษร
        
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
 * ⭐️ V 2.3: (แก้ไขครั้งใหญ่) อัปเดต handleSave
 * - เพิ่ม parameter 'actionType' ('save', 'forward', 'complete')
 * - แยกตรรกะ: 'save' (ไม่เปลี่ยนสถานะ), 'forward' (เปลี่ยนสถานะ)
 */
async function handleSave(actionType = 'save') {
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
        
        if (field.type === 'checkbox') {
            value = input.checked;
        } else if (field.type === 'file') {
            // File logic handled later
        } else if (field.type === 'select') {
            value = input.value ? (field.source ? parseInt(input.value) : input.value) : null;
        } else {
            value = input.value ? (field.type === 'number' ? parseFloat(input.value) : input.value) : null;
        }
        
        if (field.type !== 'file') {
            dataToUpdate[field.name] = value;
        }
        
        // --- Validation (ตรวจสอบเฉพาะเมื่อกดส่งต่อ หรือ ปิดโครงการ) ---
        // ถ้ากดแค่ "บันทึก" (save) อาจจะยังกรอกไม่ครบก็ได้
        if ((actionType === 'forward' || actionType === 'complete') && field.required && !input.value && (!editingProject || !editingProject[field.name])) {
            showError(`กรุณากรอกข้อมูลในช่อง "${field.label.split('(')[0].trim()}" ให้ครบถ้วนเพื่อดำเนินการต่อ`);
            hasError = true;
        }
        // ถ้าเป็นโปรเจกต์ใหม่ ต้องกรอกชื่อโครงการเสมอ
        if (isNewProject && field.name === 'projectName' && !input.value) {
            showError(`กรุณากรอกชื่อโครงการ`);
            hasError = true;
        }
    });

    // ⭐️ V 2.4: ตรวจสอบ Checkbox ทีม Survey (รวม isBudgetEstimated เข้าไปในเงื่อนไข)
    if (currentRole === 'survey' && actionType === 'forward') {
        const { isBudgetEstimated, workScopeDesign, workScopeBidding, workScopePM } = dataToUpdate;
        if (!isBudgetEstimated && !workScopeDesign && !workScopeBidding && !workScopePM) {
            showError('กรุณาเลือกขอบเขตงานอย่างน้อย 1 รายการ');
            hasError = true;
        }
    }

    if (hasError) return;
    
    showLoading();
    try {
        let projectData = isNewProject ? {} : { ...editingProject };
        
        // ลบ object ที่ join มา
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
        
        // ⭐️ V 2.3: Status Transition Logic (แยกตาม Action)
        // 1. ถ้าเป็นโปรเจกต์ใหม่ ให้สถานะเริ่มต้นเป็น role ปัจจุบัน (เช่น 'survey')
        if (isNewProject) {
             // ถ้าแอดมินสร้าง ให้เป็น design หรือตามที่เลือก (ในอนาคต) แต่ตอนนี้ default design
             // ถ้า Survey สร้าง ให้เป็น 'survey' เพื่อให้เห็นในหน้าตัวเองก่อน
            projectData.status = currentRole === 'admin' ? 'design' : currentRole;
        }

        // 2. จัดการการเปลี่ยนสถานะ
        if (currentRole !== 'admin') {
            const currentStatus = projectData.status;
            
            if (actionType === 'forward') {
                // กด "ส่งต่อ" -> เลื่อนสถานะไปขั้นถัดไป
                if (currentRole === 'survey') {
                    if (confirm('ยืนยันการส่งต่อข้อมูลไปยังทีมออกแบบ?')) {
                        projectData.status = 'design';
                    } else { hideLoading(); return; }
                } 
                else if (currentRole === 'design') {
                    if (confirm('ยืนยันการส่งต่อข้อมูลไปยังทีมประมูล?')) {
                        projectData.status = 'bidding';
                    } else { hideLoading(); return; }
                } 
                else if (currentRole === 'bidding') {
                    if (confirm('ยืนยันการส่งต่อข้อมูลไปยังทีมบริหารโครงการ (PM)?')) {
                        projectData.status = 'pm';
                    } else { hideLoading(); return; }
                }
            } 
            else if (actionType === 'complete') {
                // กด "เสร็จสิ้นโครงการ" (PM)
                if (confirm('คุณกำลังจะปิดโครงการนี้ โครงการจะถูกล็อคและไม่สามารถแก้ไขได้อีก ยืนยันหรือไม่?')) {
                    projectData.status = 'closed';
                } else { hideLoading(); return; }
            }
            // กรณี actionType === 'save' -> ไม่ทำอะไรกับ status (รักษา status เดิมไว้)
        }

        // --- Save to Supabase ---
        let result;
        if (isNewProject) {
            result = await supabaseClient.from(config.PROJECT_TABLE).insert([projectData]).select();
        } else {
            result = await supabaseClient.from(config.PROJECT_TABLE).update(projectData).eq('id', editingProject.id).select();
        }

        if (result.error) {
            showError(`การบันทึกข้อมูลล้มเหลว: ${result.error.message}`);
        } else {
            // แจ้งเตือนเล็กน้อยถ้าเป็นการส่งต่อ
            if (actionType === 'forward') {
                alert('บันทึกและส่งต่อข้อมูลสำเร็จ!');
            }
            toggleForm(null, true);
            await fetchProjects(); 
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
    const addBtnContainer = document.getElementById('addBtnContainer');
    
    addBtnContainer.style.display = (currentRole === 'admin' || currentRole === 'survey') ? 'block' : 'none';
    
    const searchContainer = document.getElementById('admin-search-container');
    searchContainer.style.display = currentRole === 'admin' ? 'flex' : 'none';
    document.getElementById('roleSelect').value = currentRole;
    renderTable();
}

function renderForm() {
    const formFieldsEl = document.getElementById('formFields');
    const fields = config.fieldsByTeam[currentRole];
    
    // 1. เตรียม HTML สำหรับ Stepper (Timeline)
    const steps = [
        { key: 'survey', label: '1. สำรวจ' },
        { key: 'design', label: '2. ออกแบบ' },
        { key: 'bidding', label: '3. ประมูล' },
        { key: 'pm', label: '4. บริหารโครงการ' },
        { key: 'closed', label: '5. เสร็จสิ้น' }
    ];
    
    // หา index ของ status ปัจจุบัน
    let currentStatusKey = editingProject ? editingProject.status : (currentRole === 'admin' ? 'design' : currentRole);
    // Map status ให้ตรงกับ key ของ stepper
    if(currentStatusKey === 'completed') currentStatusKey = 'pm'; // ให้ PM ยัง active
    
    const stepIndex = steps.findIndex(s => s.key === currentStatusKey);
    const activeIndex = stepIndex === -1 ? 0 : stepIndex;

    let stepperHtml = `<div class="stepper-container">`;
    steps.forEach((step, idx) => {
        const isActive = idx <= activeIndex;
        stepperHtml += `
            <div class="step-item ${isActive ? 'active' : ''}">
                <div class="step-circle">${idx + 1}</div>
                <div class="step-label">${step.label}</div>
            </div>
        `;
    });
    stepperHtml += `</div>`;

    // 2. เตรียม HTML สำหรับฟอร์ม (แยก 2 คอลัมน์)
    let leftColHtml = '';  // สำหรับ Input ข้อมูล
    let rightColHtml = ''; // สำหรับ Upload ไฟล์

    // ส่วนแสดงข้อมูล Readonly (ถ้ามี)
    if (editingProject && (currentRole === 'design' || currentRole === 'bidding' || currentRole === 'pm')) {
        leftColHtml += `
            <div class="form-group">
                <label>ชื่อโครงการ</label>
                <input type="text" value="${editingProject.projectName || ''}" readonly style="background:#eee; color:#555;">
            </div>`;
        
        const locationName = editingProject.Location ? editingProject.Location.site_name : (editingProject.location_id ? 'กำลังโหลด...' : '-');
        leftColHtml += `
            <div class="form-group">
                <label>สถานที่</label>
                <input type="text" value="${locationName}" readonly style="background:#eee; color:#555;">
            </div>`;
    }

    // วนลูปสร้าง Input ตาม Config
    let currentCheckboxGroup = null;
    let groupWrapper = null;
    let checkboxHtmlBuffer = ''; // พัก HTML ของ checkbox ไว้ก่อน

    fields.forEach(field => {
        const value = (editingProject && editingProject[field.name] != null) ? editingProject[field.name] : '';

        // --- จัดการ Checkbox Group ---
        if (field.type === 'checkbox' && field.group) {
            if (field.group !== currentCheckboxGroup) {
                // ถ้าเริ่มกลุ่มใหม่ และมีกลุ่มเก่าค้างอยู่ ให้ปิดกลุ่มเก่า
                if (currentCheckboxGroup !== null) {
                     leftColHtml += `<div class="form-group-checkbox"><label style="margin-bottom:0.5rem; display:block;">ขอบเขตงาน *</label>${checkboxHtmlBuffer}</div>`;
                     checkboxHtmlBuffer = '';
                }
                currentCheckboxGroup = field.group;
            }
            // สะสม HTML Checkbox
            const checked = (editingProject && editingProject[field.name]) ? 'checked' : '';
            checkboxHtmlBuffer += `
                <div class="checkbox-option">
                    <label style="font-weight:400; cursor:pointer;">
                        <input type="checkbox" id="${field.name}" name="${field.name}" ${checked}>
                        ${field.label}
                    </label>
                </div>`;
            return; // ข้ามไป loop ถัดไป (ยังไม่ render ลง leftCol)
        } else {
            // ถ้าไม่ใช่ checkbox group แต่มี buffer ค้างอยู่ ให้เท buffer ออกมาก่อน
            if (currentCheckboxGroup !== null) {
                leftColHtml += `<div class="form-group-checkbox"><label style="margin-bottom:0.5rem; display:block;">ขอบเขตงาน *</label>${checkboxHtmlBuffer}</div>`;
                checkboxHtmlBuffer = '';
                currentCheckboxGroup = null;
            }
        }

        // --- สร้าง Input HTML ปกติ ---
        if (field.type === 'file') {
            // ใส่ลงคอลัมน์ขวา (Right Column)
            let fileDisplay = '';
            if (editingProject && editingProject[field.name]) {
                fileDisplay = `
                    <a href="${editingProject[field.name]}" target="_blank" class="current-file-badge">📄 ดูไฟล์ปัจจุบัน</a>
                    <button type="button" class="btn-delete-file" onclick="window.App.removeFile('${field.name}')">❌ ลบ</button>
                `;
            }
            rightColHtml += `
                <div class="file-upload-card">
                    <label for="${field.name}">${field.label}</label>
                    <input type="file" id="${field.name}" name="${field.name}" accept="${field.accept || ''}">
                    ${fileDisplay}
                </div>
            `;
            
            // Add listener later logic remains the same, but we handle rendering here.
            // (Listener logic is handled globally below)

        } else {
            // ใส่ลงคอลัมน์ซ้าย (Left Column)
            let inputHtml = '';
            
            if (field.type === 'select') {
                inputHtml = `<select id="${field.name}" name="${field.name}">
                                <option value="">--- เลือกรายการ ---</option>`;
                if (field.options) {
                    field.options.forEach(opt => inputHtml += `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`);
                } else if (field.source) {
                     const dataSource = (field.source === 'employees') ? allEmployees : allLocations;
                     dataSource.forEach(item => {
                        const id = item.EmployeeID || item.id;
                        const name = item.site_name || `${item.FirstName} ${item.LastName || ''}`.trim();
                        inputHtml += `<option value="${id}" ${value == id ? 'selected' : ''}>${name}</option>`;
                     });
                }
                inputHtml += `</select>`;
            } else if (field.type === 'checkbox') { // Single Checkbox
                 const checked = (editingProject && editingProject[field.name]) ? 'checked' : '';
                 inputHtml = `
                    <div style="display:flex; align-items:center; gap:10px; background:#f9f9f9; padding:10px; border-radius:8px;">
                        <input type="checkbox" id="${field.name}" name="${field.name}" ${checked} style="width:auto;">
                        <label for="${field.name}" style="margin:0; cursor:pointer;">${field.label}</label>
                    </div>
                 `;
            } else { // Text, Number, Date
                 const readonly = (field.name === 'projectName' && editingProject && currentRole !== 'admin' && currentRole !== 'survey') ? 'readonly style="background:#eee;"' : '';
                 inputHtml = `<input type="${field.type}" id="${field.name}" name="${field.name}" value="${value}" ${readonly} placeholder="...">`;
            }

            if (field.type !== 'checkbox') {
                leftColHtml += `
                    <div class="form-group">
                        <label for="${field.name}">${field.label} ${field.required ? '<span style="color:red">*</span>' : ''}</label>
                        ${inputHtml}
                    </div>
                `;
            } else {
                leftColHtml += `<div class="form-group">${inputHtml}</div>`;
            }
        }
    });

    // เก็บตก Checkbox Group ท้ายสุด
    if (currentCheckboxGroup !== null) {
         leftColHtml += `<div class="form-group-checkbox"><label style="margin-bottom:0.5rem; display:block;">ขอบเขตงาน *</label>${checkboxHtmlBuffer}</div>`;
    }

    // 3. ประกอบร่าง HTML ทั้งหมด
    formFieldsEl.innerHTML = `
        ${stepperHtml}
        <div class="form-layout-wrapper">
            <div class="form-left-col">
                <h3 style="font-size:1.1rem; color:var(--primary); margin-bottom:1rem; border-bottom:1px solid #eee; padding-bottom:0.5rem;">ข้อมูลโครงการ</h3>
                ${leftColHtml}
            </div>
            <div class="form-right-col">
                <h3 style="font-size:1.1rem; color:var(--primary); margin-bottom:1rem; border-bottom:1px solid #eee; padding-bottom:0.5rem;">เอกสารและไฟล์แนบ</h3>
                <div class="file-upload-section">
                    ${rightColHtml || '<div style="text-align:center; color:#999;">ไม่มีส่วนอัปโหลดไฟล์สำหรับขั้นตอนนี้</div>'}
                </div>
            </div>
        </div>
    `;

    // 4. Re-attach Event Listeners for Files
    fields.forEach(field => {
        if (field.type === 'file') {
            const fileInput = document.getElementById(field.name);
            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        fileInputs[field.name] = e.target.files[0];
                    } else {
                        delete fileInputs[field.name];
                    }
                });
            }
        }
    });

    // 5. Re-attach Date Logic (Logic เดิม)
    if (currentRole === 'survey') {
         const startInput = document.getElementById('surveyStartDate');
         const endInput = document.getElementById('surveyEndDate');
         const durationInput = document.getElementById('plannedDuration');
         if (durationInput) {
             durationInput.setAttribute('readonly', true);
             durationInput.style.backgroundColor = '#eeeeee';
         }
         if (endInput && !document.getElementById('date-diff-display')) {
             const displaySpan = document.createElement('div');
             displaySpan.id = 'date-diff-display';
             displaySpan.style.color = 'var(--primary)';
             displaySpan.style.fontSize = '0.9rem';
             displaySpan.style.marginTop = '0.5rem';
             displaySpan.style.fontWeight = 'bold';
             endInput.parentNode.appendChild(displaySpan);

             const calculateDays = () => {
                 if (startInput.value && endInput.value) {
                     const start = new Date(startInput.value);
                     const end = new Date(endInput.value);
                     const diffTime = end - start;
                     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                     if (diffDays >= 0) {
                         if (durationInput) durationInput.value = diffDays;
                         displaySpan.textContent = ``; 
                     } else {
                         if (durationInput) durationInput.value = '';
                         displaySpan.textContent = `วันจบงานต้องอยู่หลังวันเริ่มงาน`;
                         displaySpan.style.color = '#c62828';
                     }
                 }
             };
             startInput.addEventListener('change', calculateDays);
             endInput.addEventListener('change', calculateDays);
             calculateDays();
         }
    }

    // 6. Re-attach Tom Select (Logic เดิม)
    const locationSelect = document.getElementById('location_id');
    if (locationSelect) {
        new TomSelect(locationSelect, {
            create: false,
            sortField: { field: "text", direction: "asc" },
            placeholder: 'พิมพ์ชื่อสถานที่เพื่อค้นหา...',
        });
    }
    const employeeSelects = document.querySelectorAll('select[id*="_id"]');
    employeeSelects.forEach(select => {
        if(select.id !== 'location_id') {
             new TomSelect(select, {
                create: false,
                placeholder: 'พิมพ์ชื่อเพื่อค้นหา...',
            });
        }
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
         if (currentRole === 'survey') {
             // ทีม Survey เห็นโปรเจกต์ที่สถานะเป็น 'survey' (ที่ตัวเองสร้างและยังไม่ส่งต่อ)
             // หรือโปรเจกต์ที่ตัวเองเพิ่งส่งไป ('design') -- ในที่นี้เอาเฉพาะที่อยู่กับตัวเอง
             projectsToDisplay = projects.filter(p => p.status === 'survey');
         } else {
             // ทีมอื่นเห็นงานที่ส่งมาถึงตัวเอง
             projectsToDisplay = projects.filter(p => p.status === currentRole);
         }
    }

    const title = currentRole === 'admin'
        ? `โครงการทั้งหมด (${projectsToDisplay.length})`
        : (currentRole === 'survey'
            ? `งานของทีมสำรวจ (ร่าง/รอส่งต่อ)`
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

        const workScopes = [
            project.workScopeDesign ? 'ออกแบบ' : null,
            project.workScopeBidding ? 'ประมูล' : null,
            project.workScopePM ? 'บริหารโครงการ' : null
        ].filter(Boolean).join(', ') || '-';

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
                        <p><strong>ผู้จัดการ:</strong> ${getPM(project)}</p>
                        <p><strong>สถานที่:</strong> ${getLocation(project)}</p>
                        <p><strong>งบประมาณ:</strong> ${project.budget ? project.budget.toLocaleString('th-TH') : '-'}</p>
                        <p><strong>ราคาก่อสร้างจริง:</strong> ${project.actualCost ? project.actualCost.toLocaleString('th-TH') : '-'}</p>
                        
                        <p><strong>ประเภทก่อสร้าง:</strong> ${project.constructionType || '-'}</p>
                        <p><strong>ขอบเขตงาน:</strong> ${workScopes}</p>
                        <p><strong>Requirement:</strong> ${project.requirement || '-'}</p>
                        
                        <p><strong>ผู้กรอก (สำรวจ):</strong> ${getSurveyor(project)}</p>
                        <p><strong>ผู้กรอก (ออกแบบ):</strong> ${getDesignOwner(project)}</p>
                        <p><strong>ผู้กรอก (ประมูล):</strong> ${getBiddingOwner(project)}</p>
                        <p><strong>ผู้กรอก (PM):</strong> ${getPMOwner(project)}</p>
                        
                        <p><strong>วันเริ่มงานก่อสร้าง:</strong> ${project.surveyStartDate || '-'}</p>
                        <p><strong>วันจบงานก่อสร้าง:</strong> ${project.surveyEndDate || '-'}</p>

                        <p><strong>ระยะเวลาตามแผน:</strong> ${project.plannedDuration || '-'} วัน</p>
                        <p><strong>ระยะเวลาจริง:</strong> ${project.actualDuration || '-'} วัน</p>
                        
                        <div style="grid-column: 1 / -1; border-top: 1px solid #eee; padding-top: 0.5rem; margin-top: 0.5rem;">
                            <strong>ไฟล์ทีมออกแบบ:</strong><br>
                            ${project.requirementPDF ? `<a href="${project.requirementPDF}" target="_blank" class="file-link">Requirement</a>` : ''}
                            ${project.initialDesignPDF ? `<a href="${project.initialDesignPDF}" target="_blank" class="file-link">แบบขั้นต้น</a>` : ''}
                            ${project.detailedDesignPDF ? `<a href="${project.detailedDesignPDF}" target="_blank" class="file-link">แบบรายละเอียด</a>` : ''}
                            ${project.calculationPDF ? `<a href="${project.calculationPDF}" target="_blank" class="file-link">รายการคำนวณ</a>` : ''}
                            ${project.overlapPDF ? `<a href="${project.overlapPDF}" target="_blank" class="file-link">พื้นที่ทับซ้อน</a>` : ''}
                            ${project.supportingDocsPDF ? `<a href="${project.supportingDocsPDF}" target="_blank" class="file-link">เอกสารประกอบ</a>` : ''}
                            ${project.rvtModel ? `<a href="${project.rvtModel}" target="_blank" class="file-link">โมเดล RVT</a>` : ''}
                            ${project.ifcModel ? `<a href="${project.ifcModel}" target="_blank" class="file-link">โมเดล IFC</a>` : ''}
                            <br>
                            <strong>ไฟล์ทีมประมูล:</strong><br>
                            ${project.biddingPDF ? `<a href="${project.biddingPDF}" target="_blank" class="file-link">แบบประมูล</a>` : ''}
                            ${project.clarificationPDF ? `<a href="${project.clarificationPDF}" target="_blank" class="file-link">บันทึกชี้แจง</a>` : ''}
                            ${project.torPDF ? `<a href="${project.torPDF}" target="_blank" class="file-link">TOR</a>` : ''}
                            ${project.biddingDocsPDF ? `<a href="${project.biddingDocsPDF}" target="_blank" class="file-link">เอกสารประมูล</a>` : ''}
                            ${project.boqPDF ? `<a href="${project.boqPDF}" target="_blank" class="file-link">BOQ</a>` : ''}
                            ${project.projectImage ? `<a href="${project.projectImage}" target="_blank" class="file-link">รูปภาพ (3D)</a>` : ''}
                            <br>
                            <strong>เอกสารบริหารโครงการ (PM):</strong><br>
                            ${project.permissionDocsPDF ? `<a href="${project.permissionDocsPDF}" target="_blank" class="file-link">ขออนุญาต</a>` : ''}
                            ${project.weeklyReportPDF ? `<a href="${project.weeklyReportPDF}" target="_blank" class="file-link">รายงานประชุม</a>` : ''}
                            ${project.approvalDocsPDF ? `<a href="${project.approvalDocsPDF}" target="_blank" class="file-link">ขออนุมัติ</a>` : ''}
                            ${project.memoPDF ? `<a href="${project.memoPDF}" target="_blank" class="file-link">บันทึกต่างๆ</a>` : ''}
                            ${project.changeOrderPDF ? `<a href="${project.changeOrderPDF}" target="_blank" class="file-link">งานเพิ่ม/ลด</a>` : ''}
                            ${project.weeklySiteImagesPDF ? `<a href="${project.weeklySiteImagesPDF}" target="_blank" class="file-link">รูปหน้างาน</a>` : ''}
                            ${project.defectChecklistPDF ? `<a href="${project.defectChecklistPDF}" target="_blank" class="file-link">ตรวจ Defect</a>` : ''}
                            ${project.handoverDocsPDF ? `<a href="${project.handoverDocsPDF}" target="_blank" class="file-link">เอกสารส่งมอบ</a>` : ''}
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
    
    let submitterHeader = "ผู้ส่งเรื่อง";
    if (currentRole === 'design') submitterHeader = 'ผู้สำรวจ';
    if (currentRole === 'bidding') submitterHeader = 'ผู้ออกแบบ';
    if (currentRole === 'pm') submitterHeader = 'ผู้ประมูล';

    let html = `<table><thead><tr>
        <th>ชื่อโครงการ</th>
        <th>${submitterHeader}</th>
        <th>ผู้จัดการ</th>
        <th>งบประมาณ</th>
        <th>ไฟล์ล่าสุด</th>
        <th>จัดการ</th>
    </tr></thead><tbody>`;
    
    projectsToDisplay.forEach(project => {
        let fileLinks = '';
        
        // Logic การแสดงไฟล์ในตารางย่อ (แสดงเฉพาะไฟล์สำคัญ)
        if (currentRole === 'pm' || currentRole === 'admin') {
             // ถ้าเป็น PM ให้เห็นไฟล์งานก่อสร้างและรายงาน
             if (project.weeklyReportPDF) fileLinks += `<a href="${project.weeklyReportPDF}" target="_blank" class="file-link">รายงานประชุม</a>`;
             if (project.weeklySiteImagesPDF) fileLinks += `<a href="${project.weeklySiteImagesPDF}" target="_blank" class="file-link">รูปหน้างาน</a>`;
        }
        if (project.requirementPDF) fileLinks += `<a href="${project.requirementPDF}" target="_blank" class="file-link">Requirement</a>`;
        if (project.biddingPDF) fileLinks += `<a href="${project.biddingPDF}" target="_blank" class="file-link">แบบประมูล</a>`;
        if (project.detailedDesignPDF) fileLinks += `<a href="${project.detailedDesignPDF}" target="_blank" class="file-link">แบบรายละเอียด</a>`;
        if (project.torPDF) fileLinks += `<a href="${project.torPDF}" target="_blank" class="file-link">TOR</a>`;
        if (project.projectImage) fileLinks += `<a href="${project.projectImage}" target="_blank" class="file-link">รูป 3D</a>`;

        const isClosed = project.status === 'closed';
        
        let submitterName = '-';
        if (currentRole === 'design') submitterName = getSurveyor(project);
        if (currentRole === 'bidding') submitterName = getDesignOwner(project);
        if (currentRole === 'pm') submitterName = getBiddingOwner(project);

        const budgetDisplay = project.budget ? project.budget.toLocaleString('th-TH') : '-';

        html += `<tr>
            <td><strong>${project.projectName || '-'}</strong></td>
            <td>${submitterName}</td>
            <td>${getPM(project)}</td>
            <td>${budgetDisplay}</td>
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
    toggleForm(null, true); 
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
    const addBtnContainer = document.getElementById('addBtnContainer');
    const saveBtn = document.getElementById('saveBtn');
    const completeBtn = document.getElementById('completeBtn');
    
    // ⭐️ V 2.3: หาหรือสร้างปุ่ม "ส่งต่อ" (Forward Button)
    let forwardBtn = document.getElementById('forwardBtn');
    if (!forwardBtn) {
        // ถ้ายังไม่มีปุ่ม ให้สร้างใหม่และแทรกไว้ข้างๆ ปุ่ม save
        forwardBtn = document.createElement('button');
        forwardBtn.id = 'forwardBtn';
        forwardBtn.className = 'btn btn-gold'; // ใช้ class เดียวกับปุ่มหลัก
        forwardBtn.style.flex = '1';
        forwardBtn.textContent = 'บันทึกและส่งต่อ';
        forwardBtn.onclick = () => window.App.forwardProject();
        
        // แทรกปุ่ม Forward ก่อนปุ่ม Save (เพื่อให้ Save เป็นปุ่มรอง หรือตามดีไซน์)
        // แต่ในที่นี้เราจะแทรก *หลัง* ปุ่ม Save (หรือแทนที่ถ้าต้องการ)
        // เอาไว้ข้างๆ ปุ่ม Save
        saveBtn.parentNode.insertBefore(forwardBtn, saveBtn.nextSibling);
    }

    editingProject = projectToEdit ? { ...projectToEdit } : null;
    fileInputs = {};

    if (forceClose) {
        form.style.display = 'none';
        if(addBtnContainer) {
            addBtnContainer.style.display = (currentRole === 'admin' || currentRole === 'survey') ? 'block' : 'none';
        }
        completeBtn.style.display = 'none';
        if(forwardBtn) forwardBtn.style.display = 'none'; 
        editingProject = null;
        return;
    }
    
    if (form.style.display === 'none' || projectToEdit) {
        document.getElementById('formTitle').textContent = projectToEdit ? `แก้ไขโครงการ: ${projectToEdit.projectName}` : 'เพิ่มโครงการใหม่';
        if(addBtnContainer) addBtnContainer.style.display = 'none';
        
        // ⭐️ V 2.3: Logic การแสดงปุ่มตาม Role
        // Default: ซ่อนปุ่มพิเศษก่อน
        completeBtn.style.display = 'none';
        forwardBtn.style.display = 'none';
        saveBtn.textContent = 'บันทึก (ยังไม่ส่ง)'; // เปลี่ยนข้อความให้ชัดเจน

        if (currentRole === 'admin') {
            // Admin: มีแค่บันทึก
            saveBtn.textContent = 'บันทึก';
            saveBtn.style.display = 'block';
        } 
        else if (currentRole === 'pm') {
            // PM: มีบันทึก และ จบโครงการ
            saveBtn.textContent = 'บันทึก';
            completeBtn.style.display = 'block';
        } 
        else {
            // Survey, Design, Bidding: มี บันทึก และ ส่งต่อ
            saveBtn.style.display = 'block';
            forwardBtn.style.display = 'block';
            forwardBtn.textContent = 'บันทึกและส่งต่อ';
        }
        
        renderForm(); 
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        if(addBtnContainer && (currentRole === 'admin' || currentRole === 'survey')) {
             addBtnContainer.style.display = 'block';
        }
        form.style.display = 'none';
        completeBtn.style.display = 'none';
        if(forwardBtn) forwardBtn.style.display = 'none';
    }
}

function removeFile(fieldName) {
    if (editingProject) {
        editingProject[fieldName] = null;
        fileInputs[fieldName] = null; 
        renderForm(); 
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

// 8. Export functions
window.App = {
    toggleForm,
    saveProject: () => handleSave('save'),       // ปุ่มบันทึกธรรมดา
    forwardProject: () => handleSave('forward'), // ปุ่มส่งต่อ
    completeProject: () => handleSave('complete'),
    deleteProject,
    changeRole,
    toggleDetails,
    handleSearch,
    removeFile,
    clearSearch
};