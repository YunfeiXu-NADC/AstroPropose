#!/usr/bin/env python3
"""
脚本：创建新的表单模板（Form Template）

使用方法：
    cd backend
    uv run python create_form_template.py
"""

from app import create_app, db
from app.models.models import FormTemplate, Instrument
import json

app = create_app()

# 示例表单定义
EXAMPLE_FORM = {
    "fields": [
        {
            "name": "science_goal",
            "label": "科学目标",
            "type": "textarea",
            "required": True,
            "rows": 6,
            "placeholder": "请描述您的科学研究目标..."
        },
        {
            "name": "target_name",
            "label": "目标名称",
            "type": "text",
            "required": True,
            "placeholder": "如：NGC 1234"
        },
        {
            "name": "ra",
            "label": "赤经 (RA)",
            "type": "text",
            "required": True,
            "placeholder": "HH:MM:SS.ss"
        },
        {
            "name": "dec",
            "label": "赤纬 (Dec)",
            "type": "text",
            "required": True,
            "placeholder": "+/-DD:MM:SS.s"
        },
        {
            "name": "exposure_time",
            "label": "曝光时间 (秒)",
            "type": "number",
            "required": True,
            "placeholder": "3600"
        },
        {
            "name": "filter",
            "label": "滤光片",
            "type": "select",
            "required": True,
            "options": [
                {"value": "u", "label": "u波段"},
                {"value": "g", "label": "g波段"},
                {"value": "r", "label": "r波段"},
                {"value": "i", "label": "i波段"},
                {"value": "z", "label": "z波段"}
            ]
        },
        {
            "name": "priority",
            "label": "优先级",
            "type": "select",
            "required": True,
            "options": [
                {"value": "high", "label": "高"},
                {"value": "medium", "label": "中"},
                {"value": "low", "label": "低"}
            ]
        },
        {
            "name": "time_critical",
            "label": "时间敏感",
            "type": "checkbox",
            "required": False
        }
    ]
}

def create_form_template():
    """交互式创建表单模板"""
    with app.app_context():
        print("=== 创建新的表单模板 ===\n")
        
        # 显示可用的仪器
        instruments = Instrument.query.all()
        print("可用的仪器：")
        print("  0: 通用表单（不绑定仪器）")
        for inst in instruments:
            print(f"  {inst.id}: {inst.code} - {inst.name}")
        
        # 输入表单模板信息
        print("\n请输入新表单模板的信息：")
        name = input("表单名称（如 DSL低频观测表单）: ").strip()
        phase = input("适用阶段（phase1/phase2）: ").strip() or "phase1"
        instrument_id_input = input("关联仪器ID（输入0表示通用表单）: ").strip()
        
        if not name:
            print("❌ 表单名称不能为空！")
            return
        
        # 处理仪器ID
        instrument_id = None
        if instrument_id_input and instrument_id_input != "0":
            try:
                instrument_id = int(instrument_id_input)
                instrument = Instrument.query.get(instrument_id)
                if not instrument:
                    print(f"❌ 仪器 ID {instrument_id} 不存在！")
                    return
            except ValueError:
                print("❌ 仪器ID必须是数字！")
                return
        
        # 询问是否使用示例表单
        use_example = input("\n是否使用示例表单定义？(y/n): ").strip().lower()
        
        if use_example == 'y':
            definition = EXAMPLE_FORM
            print("\n使用示例表单定义（包含：科学目标、目标名称、坐标、曝光时间、滤光片等字段）")
        else:
            print("\n请输入表单定义（JSON格式）")
            print("示例格式:")
            print(json.dumps(EXAMPLE_FORM, indent=2, ensure_ascii=False))
            print("\n请粘贴您的JSON定义（输入END结束）:")
            
            lines = []
            while True:
                line = input()
                if line.strip() == 'END':
                    break
                lines.append(line)
            
            try:
                definition = json.loads('\n'.join(lines))
            except json.JSONDecodeError as e:
                print(f"❌ JSON格式错误: {e}")
                return
        
        # 检查版本号
        existing_templates = FormTemplate.query.filter_by(
            name=name,
            instrument_id=instrument_id,
            phase=phase
        ).order_by(FormTemplate.version.desc()).all()
        
        version = 1
        if existing_templates:
            version = existing_templates[0].version + 1
            print(f"\n发现已存在版本，将创建新版本 v{version}")
        
        # 创建表单模板
        template = FormTemplate(
            name=name,
            phase=phase,
            version=version,
            instrument_id=instrument_id,
            definition=definition
        )
        db.session.add(template)
        db.session.commit()
        
        print(f"\n✅ 表单模板创建成功！")
        print(f"   ID: {template.id}")
        print(f"   名称: {template.name}")
        print(f"   阶段: {template.phase}")
        print(f"   版本: v{template.version}")
        if template.instrument:
            print(f"   关联仪器: {template.instrument.code}")
        else:
            print(f"   关联仪器: 通用表单")
        print(f"\n表单包含 {len(definition.get('fields', []))} 个字段")

if __name__ == '__main__':
    create_form_template()






