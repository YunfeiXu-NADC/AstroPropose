#!/usr/bin/env python3
"""
脚本：创建新的提案类型（Proposal Type）

使用方法：
    cd backend
    uv run python create_proposal_type.py
"""

from app import create_app, db
from app.models.models import ProposalType, Workflow

app = create_app()

def create_proposal_type():
    """交互式创建提案类型"""
    with app.app_context():
        print("=== 创建新的提案类型 ===\n")
        
        # 显示可用的工作流
        workflows = Workflow.query.all()
        if not workflows:
            print("❌ 错误：系统中没有工作流，请先创建工作流！")
            return
        
        print("可用的工作流：")
        for w in workflows:
            print(f"  ID: {w.id}, 名称: {w.name}, 描述: {w.description}")
        
        # 输入提案类型信息
        print("\n请输入新提案类型的信息：")
        name = input("名称（如 DSL-RES）: ").strip()
        description = input("描述（如 DSL研究提案）: ").strip()
        workflow_id = input(f"关联工作流ID（1-{len(workflows)}）: ").strip()
        
        if not name or not workflow_id:
            print("❌ 名称和工作流ID不能为空！")
            return
        
        try:
            workflow_id = int(workflow_id)
            workflow = Workflow.query.get(workflow_id)
            if not workflow:
                print(f"❌ 工作流 ID {workflow_id} 不存在！")
                return
        except ValueError:
            print("❌ 工作流ID必须是数字！")
            return
        
        # 检查是否已存在同名提案类型
        existing = ProposalType.query.filter_by(name=name).first()
        if existing:
            print(f"⚠️  提案类型 '{name}' 已存在（ID: {existing.id}）")
            overwrite = input("是否更新？(y/n): ").strip().lower()
            if overwrite == 'y':
                existing.description = description
                existing.workflow_id = workflow_id
                db.session.commit()
                print(f"✅ 提案类型 '{name}' 已更新！")
            return
        
        # 创建新提案类型
        proposal_type = ProposalType(
            name=name,
            description=description,
            workflow_id=workflow_id
        )
        db.session.add(proposal_type)
        db.session.commit()
        
        print(f"\n✅ 提案类型创建成功！")
        print(f"   ID: {proposal_type.id}")
        print(f"   名称: {proposal_type.name}")
        print(f"   描述: {proposal_type.description}")
        print(f"   关联工作流: {workflow.name}")

if __name__ == '__main__':
    create_proposal_type()






