# 工作流中表单和外部工具的关联说明

## 概述

本文档详细说明工作流节点（State）与表单模板的关联方式，以及外部工具如何在工作流中调用。

## 一、表单与节点的关联

### 1.1 两种关联方式

#### 方式一：通过 Phase 和 Instrument 自动加载（主要方式）

**适用场景**：创建新提案时

**工作原理**：
- 系统根据提案的 `phase`（phase1 或 phase2）和选择的 `instrument` 自动查找相关表单
- 查找规则：
  1. 查找 `phase` 匹配且 `instrument_id` 为 `NULL` 的通用表单
  2. 查找 `phase` 匹配且 `instrument_id` 匹配的仪器特定表单

**示例**：
- 创建第一阶段提案，选择 LF 仪器时：
  - 自动加载：`Proposal Info`（通用，phase1）
  - 自动加载：`Proposer Info`（通用，phase1）
  - 自动加载：`Basic Observation Parameters`（仪器特定，phase1，LF）

#### 方式二：通过 WorkflowState.form_template_id 关联（辅助方式）

**适用场景**：编辑已有提案时，提示需要填写的表单

**工作原理**：
- `WorkflowState` 表中有 `form_template_id` 字段
- 当提案处于某个状态时，如果该状态关联了表单，系统会提示用户填写
- `form_required` 字段控制表单是否必填才能离开该状态

**示例**：
- `Draft` 状态关联 `Proposal Info`（提示表单，非必填）
- `UnderReview` 状态关联 `Review Form`（必填表单）

### 1.2 DSL 工作流中的表单关联

| 状态 | 关联表单 | 表单必填 | 说明 |
|------|----------|----------|------|
| Draft | Proposal Info | 否 | 提示表单，实际会加载所有 Phase1 表单 |
| Phase1Submitted | - | - | 已提交，无需表单 |
| Scheduling | - | - | 技术编排中，无需表单 |
| Phase1Confirmed | - | - | 编排完成，无需表单 |
| Phase2Draft | Basic Observation Parameters | 否 | 提示表单，用于调整观测目标 |
| Phase2Submitted | - | - | 已提交，无需表单 |
| UnderReview | Review Form | **是** | 评审员必须填写评审表单 |
| ReviewComplete | - | - | 评审完成，无需表单 |
| FinalDecision | - | - | 最终决定，无需表单 |

### 1.3 实际使用流程

#### 创建提案时（Phase1）

1. 用户选择提案类型和仪器
2. 系统自动加载：
   - **通用表单**（phase1，无 instrument）：
     - Proposal Info
     - Proposer Info
   - **仪器表单**（phase1，LF）：
     - Basic Observation Parameters
3. 用户填写所有表单后提交

#### 编辑提案时（Phase2）

1. 提案处于 `Phase2Draft` 状态
2. 系统显示关联的表单：`Basic Observation Parameters`
3. 用户根据编排反馈调整观测目标
4. 提交 Phase2

#### 评审时

1. 提案处于 `UnderReview` 状态
2. 系统显示关联的表单：`Review Form`（必填）
3. 评审员必须填写评审表单才能完成评审

## 二、外部工具与节点的关联

### 2.1 关联方式

外部工具有**两种调用方式**：

1. **在表单字段中调用**（交互式工具）：
   - 字段配置 `external_tool_operation_id`
   - 用户在填写表单时可以点击按钮调用工具
   - 例如：目标可见性检查工具

2. **在工作流转换中调用**（自动化工具）：
   - 在 `transition.effects.external_tools` 中定义
   - 当执行该转换时自动调用
   - 例如：编排工具、通知工具

### 2.2 表单字段中的外部工具

#### 2.2.1 配置方式

在表单字段定义中添加 `external_tool_operation_id`：

```json
{
  "name": "ra",
  "label": "Right Ascension (RA)",
  "type": "text",
  "required": true,
  "external_tool_operation_id": 123  // 关联外部工具操作ID
}
```

#### 2.2.2 工作原理

1. **前端显示**：如果字段配置了 `external_tool_operation_id`，会在字段旁边显示一个按钮（如 "Check Visibility"）
2. **用户交互**：用户填写相关字段后，点击按钮调用工具
3. **API 调用**：前端调用 `/api/external-tools/operations/<operation_id>/execute`
4. **结果显示**：工具执行结果直接显示在表单中，不阻止用户继续填写

#### 2.2.3 使用场景

- **目标可见性检查**：用户输入 RA/Dec 后，检查目标是否可见
- **数据验证**：实时验证用户输入的数据
- **辅助计算**：根据用户输入计算相关参数

### 2.3 工作流转换中的外部工具

#### 2.3.1 工作原理

1. **定义位置**：在 `transition.effects.external_tools` 中定义
2. **触发时机**：当执行该转换时，系统会调用定义的外部工具
3. **执行顺序**：在状态转换之前执行（如果失败且配置为 `abort`，会阻止转换）

### 2.3 DSL 工作流中的外部工具调用

| 转换名称 | 从状态 | 到状态 | 调用的外部工具 | 说明 |
|---------|--------|--------|---------------|------|
| start_scheduling | Phase1Submitted | Scheduling | DSL 观测编排工具 | 编排观测目标 |
| complete_scheduling | Scheduling | Phase1Confirmed | DSL 通知服务 | 通知提案人编排完成 |
| finalize_decision | ReviewComplete | FinalDecision | DSL 通知服务 | 通知提案人最终决定 |

### 2.4 配置示例

```json
{
  "name": "start_scheduling",
  "label": "Start Scheduling",
  "from": "Phase1Submitted",
  "to": "Scheduling",
  "roles": ["Technical Expert", "Instrument Scheduler"],
  "effects": {
    "external_tools": [
      {
        "operation_id": 1,  // ExternalToolOperation 的 ID
        "on_failure": "continue"  // 失败处理：continue/abort/retry
      }
    ]
  }
}
```

### 2.5 外部工具执行流程

1. **用户触发转换**：技术专家点击 "Start Scheduling" 按钮
2. **系统检查权限**：验证用户是否有 "Technical Expert" 或 "Instrument Scheduler" 角色
3. **执行外部工具**：
   - 根据 `operation_id` 查找 `ExternalToolOperation`
   - 使用 `input_mapping` 从提案数据构建请求参数
   - 调用外部工具 API
   - 使用 `output_mapping` 将响应数据映射回提案
4. **处理结果**：
   - 成功：继续执行状态转换
   - 失败：根据 `on_failure` 配置决定是否阻止转换
5. **状态转换**：将提案从 `Phase1Submitted` 转换到 `Scheduling`

## 三、数据模型关系

### 3.1 表单关联关系

```
WorkflowState
  ├── form_template_id (FK) → FormTemplate.id
  └── form_required (Boolean)

FormTemplate
  ├── phase (String) - 用于自动加载
  ├── instrument_id (FK) - 用于自动加载
  └── definition (JSON) - 表单字段定义
```

### 3.2 外部工具关联关系

```
Workflow.definition.transitions[].effects.external_tools[]
  └── operation_id → ExternalToolOperation.id

ExternalToolOperation
  ├── tool_id (FK) → ExternalTool.id
  ├── input_mapping (JSON) - 输入参数映射
  └── output_mapping (JSON) - 输出数据映射
```

## 四、配置建议

### 4.1 表单关联建议

1. **创建提案时**：
   - 使用 Phase + Instrument 自动加载（不需要在 WorkflowState 中关联）
   - 确保表单的 `phase` 和 `instrument_id` 正确设置

2. **编辑提案时**：
   - 在关键状态关联主要表单（如 Draft 关联 Proposal Info）
   - 对于必须填写的表单，设置 `form_required = True`

3. **评审阶段**：
   - 在 `UnderReview` 状态关联评审表单
   - 设置 `form_required = True` 确保评审员必须填写

### 4.2 外部工具配置建议

1. **编排工具**：
   - 在 `start_scheduling` 转换中调用
   - 设置 `on_failure: "continue"`（编排失败不应阻止流程）

2. **通知工具**：
   - 在关键转换后调用（如编排完成、最终决定）
   - 设置 `on_failure: "continue"`（通知失败不应阻止流程）

3. **验证工具**（如可见性检查）：
   - 在提交转换中调用
   - 设置 `on_failure: "abort"`（验证失败应阻止提交）
   - 设置 `tool_type: "validation"` 和相应的 `validation_config`

## 五、DSL 工作流完整配置

### 5.1 表单加载规则

**Phase1 创建提案时**：
- 自动加载：Proposal Info（通用）
- 自动加载：Proposer Info（通用）
- 自动加载：Basic Observation Parameters（LF 仪器）

**Phase2 编辑提案时**：
- 显示：Basic Observation Parameters（通过 WorkflowState 关联）

**评审时**：
- 显示：Review Form（通过 WorkflowState 关联，必填）

### 5.2 外部工具调用点

1. **编排工具**：
   - 转换：`start_scheduling`
   - 时机：Phase1 提交后，技术专家开始编排
   - 功能：编排观测目标，生成编排结果

2. **通知工具（编排完成）**：
   - 转换：`complete_scheduling`
   - 时机：编排完成后
   - 功能：通知提案人查看编排反馈

3. **通知工具（最终决定）**：
   - 转换：`finalize_decision`
   - 时机：评审完成，做出最终决定后
   - 功能：通知提案人最终决定结果

## 六、常见问题

### Q1: 为什么 Draft 状态只关联了一个表单，但创建提案时显示了多个表单？

**A**: 因为表单的加载有两个机制：
1. **自动加载**：根据 phase 和 instrument 自动加载所有相关表单（创建提案时）
2. **状态关联**：WorkflowState 关联的表单主要用于提示和验证（编辑提案时）

### Q2: 外部工具可以关联到节点吗？

**A**: 外部工具有两种调用方式：
1. **表单字段调用**：字段可以配置 `external_tool_operation_id`，用户在填表时可以点击按钮调用
2. **转换调用**：在 `transition.effects.external_tools` 中定义，执行转换时自动调用

这样设计的好处是：
- **表单调用**：提供实时交互和验证，不阻塞工作流
- **转换调用**：自动化执行，有明确的触发时机和上下文
- 两种方式可以结合使用，满足不同场景需求

### Q3: 一个转换可以调用多个外部工具吗？

**A**: 可以。在 `effects.external_tools` 数组中定义多个工具，它们会按顺序执行。

### Q4: 如何确保用户填写了所有必需的表单？

**A**: 
1. 在创建提案时，前端会验证所有必填字段
2. 在状态转换时，如果 `form_required = True`，系统会检查表单是否已填写
3. 可以在转换的 `conditions` 中添加表单验证条件

## 七、总结

- **表单关联**：主要通过 Phase + Instrument 自动加载，WorkflowState 关联作为辅助提示
- **外部工具关联**：
  - **表单字段调用**：字段配置 `external_tool_operation_id`，用户交互式调用
  - **转换调用**：在 `transition.effects.external_tools` 中定义，自动执行
- **设计优势**：灵活、可配置、易于扩展，支持交互式和自动化两种调用方式
