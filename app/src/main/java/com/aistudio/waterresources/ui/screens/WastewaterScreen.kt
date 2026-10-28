package com.aistudio.waterresources.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aistudio.waterresources.data.model.*
import com.aistudio.waterresources.ui.theme.*
import com.aistudio.waterresources.ui.viewmodel.WaterResourcesUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WastewaterScreen(
    state: WaterResourcesUiState,
    onSelectFacility: (WastewaterFacility?) -> Unit,
    onAddFacility: (WastewaterFacility) -> Unit,
    onDeleteFacility: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val isLao = state.language == Language.LO
    var searchQuery by remember { mutableStateOf("") }
    var selectedSector by remember { mutableStateOf("ALL") }
    var showAddDialog by remember { mutableStateOf(false) }

    val sectors = listOf("ALL", "ໂຮງງານອຸດສາຫະກຳ", "ເຂດເສດຖະກິດພິເສດ", "ໂຮງງານແປຮູບ")

    val filteredFacilities = state.wastewaterFacilities.filter { f ->
        val matchesSearch = f.facilityName.contains(searchQuery, ignoreCase = true) ||
                f.companyName.contains(searchQuery, ignoreCase = true) ||
                f.receivingWaterBody.contains(searchQuery, ignoreCase = true)
        val matchesSector = selectedSector == "ALL" || f.sector == selectedSector
        matchesSearch && matchesSector
    }

    val totalDischarge = filteredFacilities.sumOf { it.dischargeVolume }

    Scaffold(
        containerColor = Slate950,
        floatingActionButton = {
            if (!state.isGuestMode) {
                FloatingActionButton(
                    onClick = { showAddDialog = true },
                    containerColor = Rose600,
                    contentColor = Slate100,
                    modifier = Modifier.testTag("add_facility_fab")
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Add Facility")
                }
            }
        }
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = if (isLao) "🏭 ລະບົບຕິດຕາມໂຄງການປ່ອຍນ້ຳເປື້ອນ" else "🏭 Wastewater Discharge Monitoring",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = Slate100
                    )
                    Text(
                        text = if (isLao) "ຕິດຕາມກວດກາມາດຕະຖານນ້ຳເສຍປ່ອຍອອກສິ່ງແວດລ້ອມ" else "Effluent Discharge & WWTP Audits",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Slate400
                    )
                }
            }

            // Summary KPI
            Surface(
                color = Slate900,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = if (isLao) "ປະລິມານນ້ຳເປື້ອນປ່ອຍອອກລວມ:" else "Total Daily Effluent Volume:",
                            fontSize = 11.sp,
                            color = Slate400
                        )
                        Text(
                            text = "%,.0f m³/day".format(totalDischarge),
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black),
                            color = Rose400
                        )
                    }
                    Surface(color = Rose600.copy(alpha = 0.2f), shape = RoundedCornerShape(10.dp)) {
                        Text(
                            text = "${filteredFacilities.size} " + if (isLao) "ແຫ່ງ" else "units",
                            color = Rose300,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Search Bar
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Slate400) },
                placeholder = {
                    Text(
                        text = if (isLao) "ຄົ້ນຫາໂຮງງານ ຫຼື ແຫຼ່ງນ້ຳຮັບ..." else "Search facility or receiving water...",
                        color = Slate400,
                        fontSize = 12.sp
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("wastewater_search_field"),
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Slate900,
                    unfocusedContainerColor = Slate900,
                    focusedBorderColor = Rose500,
                    unfocusedBorderColor = Slate800,
                    focusedTextColor = Slate100,
                    unfocusedTextColor = Slate100
                ),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Sector Filter Chips
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(bottom = 10.dp)
            ) {
                items(sectors) { sec ->
                    val selected = (selectedSector == sec)
                    FilterChip(
                        selected = selected,
                        onClick = { selectedSector = sec },
                        label = {
                            Text(
                                text = if (sec == "ALL") (if (isLao) "ທຸກຂະແໜງ" else "All Sectors") else sec,
                                fontSize = 11.sp
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = Rose600,
                            selectedLabelColor = Slate100,
                            containerColor = Slate900,
                            labelColor = Slate300
                        )
                    )
                }
            }

            // Facilities List
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 80.dp)
            ) {
                items(filteredFacilities) { facility ->
                    FacilityCard(
                        facility = facility,
                        isLao = isLao,
                        onClick = { onSelectFacility(facility) }
                    )
                }
            }
        }
    }

    // Add Facility Dialog
    if (showAddDialog) {
        AddFacilityDialog(
            isLao = isLao,
            waterQualityStations = state.stations,
            onDismiss = { showAddDialog = false },
            onConfirm = { facility ->
                onAddFacility(facility)
                showAddDialog = false
            }
        )
    }

    // Facility Detail Dialog
    if (state.selectedFacility != null) {
        FacilityDetailDialog(
            facility = state.selectedFacility,
            waterQualityStations = state.stations,
            isLao = isLao,
            isAdmin = state.userSession.role == UserRole.ADMIN,
            onDismiss = { onSelectFacility(null) },
            onDelete = { onDeleteFacility(state.selectedFacility.id) }
        )
    }
}

@Composable
private fun FacilityCard(
    facility: WastewaterFacility,
    isLao: Boolean,
    onClick: () -> Unit
) {
    val statusColor = when (facility.complianceStatus) {
        ComplianceStatus.NORMAL -> Emerald400
        ComplianceStatus.WARNING -> Amber400
        ComplianceStatus.EXCEEDED -> Rose500
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable { onClick() }
            .testTag("facility_card_${facility.id}"),
        colors = CardDefaults.cardColors(containerColor = Slate900),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(color = Rose600.copy(alpha = 0.2f), shape = RoundedCornerShape(8.dp)) {
                    Text(
                        text = facility.sector,
                        color = Rose300,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }

                Surface(color = statusColor.copy(alpha = 0.15f), shape = RoundedCornerShape(8.dp)) {
                    Text(
                        text = if (isLao) facility.complianceStatus.labelLao else facility.complianceStatus.labelEn,
                        color = statusColor,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
            }

            Text(
                text = facility.facilityName,
                style = MaterialTheme.typography.titleMedium,
                color = Slate100,
                fontWeight = FontWeight.Bold
            )

            Text(
                text = "🏢 ${facility.companyName}",
                fontSize = 12.sp,
                color = Slate300
            )

            HorizontalDivider(color = Slate800)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "💧 %,.0f %s".format(facility.dischargeVolume, facility.dischargeVolumeUnit),
                    fontSize = 12.sp,
                    color = Rose400,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "🌊 ${facility.receivingWaterBody}",
                    fontSize = 12.sp,
                    color = Slate400
                )
            }

            // Quality metrics chips
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = "pH: ${facility.phValue}", fontSize = 11.sp, color = Cyan400)
                Text(text = "BOD: ${facility.bodValue} mg/L", fontSize = 11.sp, color = Amber400)
                Text(text = "COD: ${facility.codValue} mg/L", fontSize = 11.sp, color = Rose400)
                Text(text = "TSS: ${facility.tssValue} mg/L", fontSize = 11.sp, color = Slate300)
            }

            // Decree 81/PM 5-Class Classification Badge
            val bestFitClass = classifyDecree81Overall(
                ph = facility.phValue,
                bod = facility.bodValue,
                cod = facility.codValue,
                tss = facility.tssValue
            )
            Surface(
                color = Emerald500.copy(alpha = 0.14f),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (isLao) "⚖️ ຈັດປະເພດຕາມ 81/ລບ (5 ປະເພດ):" else "⚖️ Decree 81/PM (5 Classes):",
                        fontSize = 10.sp,
                        color = Slate300,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "🎯 $bestFitClass",
                        fontSize = 11.sp,
                        color = if (bestFitClass.contains("ເກີນ")) Rose400 else Emerald400,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

private data class Decree81ParamRow(
    val nameLao: String,
    val unit: String,
    val enteredValue: Double,
    val classLimits: List<String>,
    val classPassed: List<Boolean>,
    val bestClass: String
)

private fun classifyDecree81Param(
    value: Double,
    c1: (Double) -> Boolean,
    c2: (Double) -> Boolean,
    c3: (Double) -> Boolean,
    c4: (Double) -> Boolean,
    c5: (Double) -> Boolean
): Pair<List<Boolean>, String> {
    val passed = listOf(c1(value), c2(value), c3(value), c4(value), c5(value))
    val idx = passed.indexOfFirst { it }
    val best = if (idx >= 0) "ປະເພດ ${idx + 1}" else "ເກີນປະເພດ 5"
    return passed to best
}

private fun buildDecree81ComparisonRows(
    ph: Double,
    bod: Double,
    cod: Double,
    tss: Double
): List<Decree81ParamRow> {
    val (phPass, phBest) = classifyDecree81Param(
        ph,
        { it in 6.0..8.5 },
        { it in 6.0..8.5 },
        { it in 5.0..9.0 },
        { it in 5.0..9.0 },
        { it in 5.0..9.0 }
    )
    val (bodPass, bodBest) = classifyDecree81Param(
        bod,
        { it <= 1.5 },
        { it <= 1.5 },
        { it <= 2.0 },
        { it <= 4.0 },
        { it <= 10.0 }
    )
    val (codPass, codBest) = classifyDecree81Param(
        cod,
        { it <= 5.0 },
        { it <= 5.0 },
        { it <= 7.0 },
        { it <= 10.0 },
        { it <= 25.0 }
    )
    val (tssPass, tssBest) = classifyDecree81Param(
        tss,
        { it <= 10.0 },
        { it <= 25.0 },
        { it <= 40.0 },
        { it <= 60.0 },
        { it <= 100.0 }
    )
    return listOf(
        Decree81ParamRow(
            nameLao = "pH (ກົດ-ດ່າງ)",
            unit = "",
            enteredValue = ph,
            classLimits = listOf("6-8.5", "6-8.5", "5-9", "5-9", "5-9"),
            classPassed = phPass,
            bestClass = phBest
        ),
        Decree81ParamRow(
            nameLao = "BOD₅",
            unit = "mg/L",
            enteredValue = bod,
            classLimits = listOf("≤1.5", "≤1.5", "≤2.0", "≤4.0", "≤10"),
            classPassed = bodPass,
            bestClass = bodBest
        ),
        Decree81ParamRow(
            nameLao = "COD",
            unit = "mg/L",
            enteredValue = cod,
            classLimits = listOf("≤5.0", "≤5.0", "≤7.0", "≤10", "≤25"),
            classPassed = codPass,
            bestClass = codBest
        ),
        Decree81ParamRow(
            nameLao = "TSS",
            unit = "mg/L",
            enteredValue = tss,
            classLimits = listOf("≤10", "≤25", "≤40", "≤60", "≤100"),
            classPassed = tssPass,
            bestClass = tssBest
        )
    )
}

private fun classifyDecree81Overall(
    ph: Double,
    bod: Double,
    cod: Double,
    tss: Double
): String {
    val rows = buildDecree81ComparisonRows(ph, bod, cod, tss)
    val order = listOf("ປະເພດ 1", "ປະເພດ 2", "ປະເພດ 3", "ປະເພດ 4", "ປະເພດ 5", "ເກີນປະເພດ 5")
    var worstIdx = 0
    rows.forEach { r ->
        val idx = order.indexOf(r.bestClass)
        if (idx > worstIdx) worstIdx = idx
    }
    return order[worstIdx]
}

@Composable
private fun Decree81ComparisonSection(
    ph: Double,
    bod: Double,
    cod: Double,
    tss: Double
) {
    val rows = buildDecree81ComparisonRows(ph, bod, cod, tss)
    val overallClass = classifyDecree81Overall(ph, bod, cod, tss)
    val classLabels = listOf(
        "ປະເພດ 1" to "🏔️ ທຳມະຊາດ",
        "ປະເພດ 2" to "💧 ອຸປະໂພກ",
        "ປະເພດ 3" to "🌾 ກະສິກຳ",
        "ປະເພດ 4" to "🏭 ອຸດສາຫະກຳ",
        "ປະເພດ 5" to "🚢 ລະບາຍນ້ຳ"
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Slate950)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = "🏛️ ຜົນການປຽບທຽບຂໍ້ມູນທີ່ປ້ອນເຂົ້າ ກັບ ການຈັດປະເພດຄຸນນະພາບນໍ້າທັງ 5 ປະເພດ ຕາມຂໍ້ຕົກລົງ 81/ລບ:",
            color = Emerald400,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
        )
        Surface(
            color = if (overallClass.contains("ເກີນ")) Rose500.copy(alpha = 0.2f) else Emerald500.copy(alpha = 0.2f),
            shape = RoundedCornerShape(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "🎯 ການຈັດປະເພດຄຸນນະພາບນໍ້າຕົວຈິງ (5 ປະເພດ 81/ລບ): $overallClass",
                color = if (overallClass.contains("ເກີນ")) Rose300 else Emerald400,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(8.dp)
            )
        }

        // 5 Class overview chips
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            items(classLabels.indices.toList()) { idx ->
                val (cId, cShort) = classLabels[idx]
                val passCount = rows.count { it.classPassed[idx] }
                val allPass = passCount == rows.size
                val isBest = overallClass == cId
                Surface(
                    color = if (allPass) Emerald500.copy(alpha = 0.16f) else Rose500.copy(alpha = 0.14f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
                        Text(
                            text = if (isBest) "🎯 $cId" else cId,
                            color = Slate100,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(text = cShort, color = Slate400, fontSize = 9.sp)
                        Text(
                            text = if (allPass) "✅ ຜ່ານ ($passCount/${rows.size})" else "❌ ຜ່ານ $passCount/${rows.size}",
                            color = if (allPass) Emerald400 else Rose400,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        HorizontalDivider(color = Slate800)

        Text(
            text = "📋 ຕາຕະລາງປຽບທຽບຂໍ້ມູນທີ່ໄດ້ປ້ອນເຂົ້າ ກັບ 5 ປະເພດຄຸນນະພາບນໍ້າ (ປະເພດ 1 – 5):",
            color = Cyan400,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
        )

        rows.forEach { r ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(Slate900)
                    .padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "${r.nameLao}: ${r.enteredValue} ${r.unit}".trim(),
                        color = Slate100,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "🎯 ${r.bestClass}",
                        color = if (r.bestClass.contains("ເກີນ")) Rose400 else Emerald400,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    for (i in 0 until 5) {
                        val passed = r.classPassed[i]
                        Text(
                            text = "ປ.${i + 1}(${r.classLimits[i]})${if (passed) "✅" else "❌"}",
                            color = if (passed) Emerald400 else Rose400,
                            fontSize = 9.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AddFacilityDialog(
    isLao: Boolean,
    waterQualityStations: List<WaterQualityStation> = emptyList(),
    onDismiss: () -> Unit,
    onConfirm: (WastewaterFacility) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var company by remember { mutableStateOf("") }
    var sector by remember { mutableStateOf("ໂຮງງານອຸດສາຫະກຳ") }
    var volumeText by remember { mutableStateOf("500") }
    var receivingWater by remember { mutableStateOf("ແມ່ນ້ຳຂອງ") }
    var treatmentSystem by remember { mutableStateOf("Activated Sludge") }
    var province by remember { mutableStateOf("ນະຄອນຫຼວງວຽງຈັນ") }
    var phText by remember { mutableStateOf("7.5") }
    var bodText by remember { mutableStateOf("20.0") }
    var codText by remember { mutableStateOf("60.0") }
    var tssText by remember { mutableStateOf("30.0") }
    var linkedStationLabel by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Slate900,
        title = {
            Text(
                text = if (isLao) "🏭 ເພີ່ມໂຄງການປ່ອຍນ້ຳເປື້ອນ" else "Add Wastewater Facility",
                color = Slate100,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (waterQualityStations.isNotEmpty()) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(Slate950)
                                .padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = "🔗 ລີ້ງຂໍ້ມູນຄຸນນະພາບນໍ້າຂອງບໍລິສັດ ຈາກລະບົບຄຸນນະພາບນໍ້າ (ຈັດປະເພດ 5 ປະເພດ 81/ລບ):",
                                color = Cyan400,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                items(waterQualityStations) { st ->
                                    val latest = st.readings.firstOrNull()
                                    val isSelected = linkedStationLabel == st.stationCode
                                    Surface(
                                        color = if (isSelected) Emerald500.copy(alpha = 0.25f) else Slate900,
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.clickable {
                                            linkedStationLabel = st.stationCode
                                            if (name.isBlank()) name = st.name
                                            if (company.isBlank()) company = st.name
                                            receivingWater = st.river
                                            province = st.province
                                            if (latest != null) {
                                                phText = latest.ph.toString()
                                                bodText = latest.bod5.toString()
                                                codText = latest.cod.toString()
                                                tssText = latest.tss.toString()
                                            }
                                        }
                                    ) {
                                        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
                                            Text(
                                                text = "🏢 ${st.name}",
                                                color = Slate100,
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                            Text(
                                                text = "${st.river} • BOD: ${latest?.bod5 ?: "-"}",
                                                color = Emerald400,
                                                fontSize = 9.sp
                                            )
                                        }
                                    }
                                }
                            }
                            if (linkedStationLabel.isNotBlank()) {
                                Text(
                                    text = "✅ ດຶງຂໍ້ມູນຄຸນນະພາບນໍ້າຈາກລະຫັດ $linkedStationLabel ແລ້ວ",
                                    color = Emerald400,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
                item {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text(if (isLao) "ຊື່ໂຮງງານ / ແຫຼ່ງກຳເນີດ" else "Facility Name") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
                item {
                    OutlinedTextField(
                        value = company,
                        onValueChange = { company = it },
                        label = { Text(if (isLao) "ບໍລິສັດເຈົ້າຂອງ" else "Company") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = volumeText,
                            onValueChange = { volumeText = it },
                            label = { Text("m³/day") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = receivingWater,
                            onValueChange = { receivingWater = it },
                            label = { Text(if (isLao) "ແຫຼ່ງນ້ຳຮັບ" else "Receiving Water") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = phText,
                            onValueChange = { phText = it },
                            label = { Text("pH") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = bodText,
                            onValueChange = { bodText = it },
                            label = { Text("BOD (mg/L)") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = codText,
                            onValueChange = { codText = it },
                            label = { Text("COD (mg/L)") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = tssText,
                            onValueChange = { tssText = it },
                            label = { Text("TSS (mg/L)") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                    }
                }
                item {
                    Decree81ComparisonSection(
                        ph = phText.toDoubleOrNull() ?: 7.5,
                        bod = bodText.toDoubleOrNull() ?: 20.0,
                        cod = codText.toDoubleOrNull() ?: 60.0,
                        tss = tssText.toDoubleOrNull() ?: 30.0
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val vol = volumeText.toDoubleOrNull() ?: 500.0
                    val ph = phText.toDoubleOrNull() ?: 7.5
                    val bod = bodText.toDoubleOrNull() ?: 20.0
                    val cod = codText.toDoubleOrNull() ?: 60.0
                    val tss = tssText.toDoubleOrNull() ?: 30.0

                    val status = if (ph in 6.0..9.0 && bod <= 30.0 && cod <= 100.0) {
                        ComplianceStatus.NORMAL
                    } else if (ph in 5.5..9.5 && bod <= 40.0) {
                        ComplianceStatus.WARNING
                    } else {
                        ComplianceStatus.EXCEEDED
                    }

                    val facility = WastewaterFacility(
                        id = "WW-${System.currentTimeMillis()}",
                        facilityName = if (name.isNotBlank()) name else "ໂຮງງານໃໝ່",
                        sector = sector,
                        companyName = if (company.isNotBlank()) company else "ບໍ່ລະບຸ",
                        permitNumber = "WW-2025/001",
                        dischargeVolume = vol,
                        receivingWaterBody = receivingWater,
                        treatmentSystem = treatmentSystem,
                        province = province,
                        district = "ໄຊທານີ",
                        village = "ດົງໂດກ",
                        latitude = 18.0,
                        longitude = 102.6,
                        lastInspectionDate = "2025-02-14",
                        complianceStatus = status,
                        phValue = ph,
                        bodValue = bod,
                        codValue = cod,
                        tssValue = tss,
                        notes = if (linkedStationLabel.isNotBlank()) "ລີ້ງຂໍ້ມູນຄຸນນະພາບນໍ້າຈາກສະຖານີ $linkedStationLabel (81/ລບ)" else ""
                    )
                    onConfirm(facility)
                },
                colors = ButtonDefaults.buttonColors(containerColor = Rose600)
            ) {
                Text(if (isLao) "ບັນທຶກ" else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(if (isLao) "ຍົກເລີກ" else "Cancel", color = Slate400)
            }
        }
    )
}

@Composable
private fun FacilityDetailDialog(
    facility: WastewaterFacility,
    waterQualityStations: List<WaterQualityStation> = emptyList(),
    isLao: Boolean,
    isAdmin: Boolean,
    onDismiss: () -> Unit,
    onDelete: () -> Unit
) {
    var activePh by remember(facility.id) { mutableStateOf(facility.phValue) }
    var activeBod by remember(facility.id) { mutableStateOf(facility.bodValue) }
    var activeCod by remember(facility.id) { mutableStateOf(facility.codValue) }
    var activeTss by remember(facility.id) { mutableStateOf(facility.tssValue) }
    var linkedWqTitle by remember(facility.id) { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Slate900,
        title = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = facility.facilityName,
                    color = Slate100,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = Slate400)
                }
            }
        },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    Text(text = "ຂະແໜງການ: ${facility.sector}", color = Rose400, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Text(text = "ເຈົ້າຂອງ: ${facility.companyName}", color = Slate200, fontSize = 13.sp)
                    Text(text = "ເລກທີໃບອະນຸຍາດ: ${facility.permitNumber}", color = Slate300, fontSize = 12.sp)
                    Text(text = "ລະບົບບຳບັດ: ${facility.treatmentSystem}", color = Slate400, fontSize = 12.sp)
                }

                item {
                    HorizontalDivider(color = Slate800)
                }

                item {
                    Text(text = "ປະລິມານນ້ຳເປື້ອນ: %,.0f %s".format(facility.dischargeVolume, facility.dischargeVolumeUnit), color = Cyan400, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Text(text = "ແຫຼ່ງນ້ຳຮັບ: ${facility.receivingWaterBody}", color = Slate200, fontSize = 12.sp)
                    Text(text = "ກວດກາລ່າສຸດ: ${facility.lastInspectionDate}", color = Slate400, fontSize = 12.sp)
                }

                if (waterQualityStations.isNotEmpty()) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(Slate950)
                                .padding(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = "🔗 ລີ້ງຂໍ້ມູນຄຸນນະພາບນໍ້າຂອງບໍລິສັດ ຈາກລະບົບຄຸນນະພາບນໍ້າ ເພື່ອຈັດປະເພດ 5 ປະເພດ (81/ລບ):",
                                color = Cyan400,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                items(waterQualityStations) { st ->
                                    val r = st.readings.firstOrNull()
                                    val selected = linkedWqTitle == st.name
                                    Surface(
                                        color = if (selected) Emerald500.copy(alpha = 0.25f) else Slate900,
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.clickable {
                                            linkedWqTitle = st.name
                                            if (r != null) {
                                                activePh = r.ph
                                                activeBod = r.bod5
                                                activeCod = r.cod
                                                activeTss = r.tss
                                            }
                                        }
                                    ) {
                                        Text(
                                            text = "🏢 ${st.name} (${st.stationCode})",
                                            color = if (selected) Emerald400 else Slate200,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
                                        )
                                    }
                                }
                            }
                            if (linkedWqTitle.isNotBlank()) {
                                Text(
                                    text = "✅ ກໍາລັງທຽບຂໍ້ມູນລີ້ງຈາກ: $linkedWqTitle",
                                    color = Emerald400,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }

                item {
                    HorizontalDivider(color = Slate800)
                }

                item {
                    Text(text = "ຄ່າວັດແທກຕົວຊີ້ວັດມາດຕະຖານ:", fontWeight = FontWeight.Bold, color = Slate100, fontSize = 13.sp)
                    Text(text = "• pH: $activePh (ມາດຕະຖານ 6.0 – 9.0)", color = Slate300, fontSize = 12.sp)
                    Text(text = "• BOD: $activeBod mg/L (ມາດຕະຖານ ≤ 30 mg/L)", color = Slate300, fontSize = 12.sp)
                    Text(text = "• COD: $activeCod mg/L (ມາດຕະຖານ ≤ 120 mg/L)", color = Slate300, fontSize = 12.sp)
                    Text(text = "• TSS: $activeTss mg/L (ມາດຕະຖານ ≤ 50 mg/L)", color = Slate300, fontSize = 12.sp)
                }

                item {
                    Decree81ComparisonSection(
                        ph = activePh,
                        bod = activeBod,
                        cod = activeCod,
                        tss = activeTss
                    )
                }

                if (facility.notes.isNotBlank()) {
                    item {
                        Text(text = "ໝາຍເຫດ: ${facility.notes}", color = Slate400, fontSize = 11.sp)
                    }
                }
            }
        },
        confirmButton = {
            if (isAdmin) {
                Button(
                    onClick = onDelete,
                    colors = ButtonDefaults.buttonColors(containerColor = Rose600)
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(if (isLao) "ລຶບ" else "Delete")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(if (isLao) "ປິດ" else "Close", color = Slate400)
            }
        }
    )
}

