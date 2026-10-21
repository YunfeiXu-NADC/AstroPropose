"""Create representative proposal records for role and progress demonstrations."""

from base64 import b64encode
from datetime import datetime, timedelta
from urllib.parse import quote

from app import create_app, db
from app.models.models import (
    FormTemplate,
    Instrument,
    InstrumentFeedback,
    Proposal,
    ProposalInstrument,
    ProposalPhase,
    ProposalReview,
    ProposalType,
    Role,
    User,
    WorkflowState,
)
from audit_proposals import DEMO_CATALOG, audit


SAMPLES = (
    {
        'title': '月球轨道低频阵列试验观测（草稿）',
        'author': 'proposer',
        'type': 'DSL 研究提案',
        'state': '草稿',
        'instruments': ('LF',),
        'draft': True,
    },
    {
        'title': '月球背面低频巡天与宇宙黎明信号探测',
        'author': 'proposer',
        'type': 'DSL 研究提案',
        'state': '待技术评审',
        'instruments': ('LF', 'HF'),
    },
    {
        'title': '太阳低频射电爆发机遇观测',
        'author': 'proposer',
        'type': 'DSL 机遇观测提案',
        'state': '待科学评审',
        'instruments': ('HF',),
    },
    {
        'title': '宇宙黑暗时代全局谱深度观测',
        'author': 'proposer',
        'type': 'DSL 研究提案',
        'state': '数据已授权',
        'instruments': ('LF',),
        'completed_reviews': True,
        'application': {
            'targets': [{
                'target_name': '宇宙黑暗时代全局谱观测天区',
                'coordinates': '赤经 12h 30m，赤纬 +18° 20′（演示坐标）',
                'observation_window': '2026-09-03 至 2026-09-06',
                'visibility_note': '演示观测窗口；非外部可见性计算结果。',
            }],
        },
        'feedback': {
            'status': 'data_ready',
            'observation_id': 'DSL-OBS-2026-0031',
            'visibility_window': '2026-09-03 至 2026-09-06',
            'completed_at': '2026-09-06 08:30 UTC',
            'summary': '观测已完成，数据已通过完整性校验并向提案申请人开放。',
            'data_products': [
                {
                    'name': 'DSL-OBS-2026-0031-观测清单.csv',
                    'format': 'CSV',
                    'size': '24 KB',
                    'description': '观测时间、频段、积分时长与质量标记。',
                    'data_url': 'data:text/csv;charset=utf-8,' + quote(
                        'observation_id,start_time,end_time,frequency_mhz,quality\n'
                        'DSL-OBS-2026-0031,2026-09-05T01:00Z,2026-09-05T05:30Z,0.5-25,validated\n'
                    ),
                },
                {
                    'name': 'DSL-OBS-2026-0031-数据说明.txt',
                    'format': 'TXT',
                    'size': '8 KB',
                    'description': '数据版本、标定状态与使用说明。',
                    'data_url': 'data:text/plain;charset=utf-8,' + quote(
                        '鸿蒙计划 DSL 观测数据包\n数据编号：DSL-OBS-2026-0031\n状态：已完成完整性校验\n'
                    ),
                },
            ],
        },
    },
    {
        'title': '木星射电暴快速响应观测',
        'author': 'admin',
        'type': 'DSL 机遇观测提案',
        'state': '已推送观测编排',
        'instruments': ('HF',),
        'feedback': {'status': 'scheduled', 'summary': '已推送观测编排负责人'},
    },
    {
        'title': '全天低频射电巡天数据产品研究',
        'author': 'chair',
        'type': 'DSL 研究提案',
        'state': '待科学评审',
        'instruments': ('LF', 'HF'),
    },
    # 研究提案：覆盖申请、评审和数据授权的每个界面阶段。
    {'title': '低频背景辐射巡天', 'author': 'proposer', 'type': 'DSL 研究提案', 'state': '待形式审查', 'instruments': ('LF',)},
    {'title': '月面射电环境建模', 'author': 'proposer', 'type': 'DSL 研究提案', 'state': '待技术评审', 'instruments': ('HF',)},
    {'title': '宇宙黎明信号搜索', 'author': 'proposer', 'type': 'DSL 研究提案', 'state': '待科学评审', 'instruments': ('LF', 'HF')},
    {'title': '星际介质低频成像', 'author': 'proposer', 'type': 'DSL 研究提案', 'state': '待分配观测数据', 'instruments': ('LF',)},
    {
        'title': '月背射电源目录',
        'author': 'proposer', 'type': 'DSL 研究提案', 'state': '数据已授权', 'instruments': ('LF',),
        'feedback': {'status': 'data_ready', 'observation_id': 'DSL-DEMO-ACCESS-01', 'summary': '演示数据已授权，可进入数据页面下载。', 'data_products': [{'name': '月背射电源目录.csv', 'format': 'CSV', 'size': '12 KB', 'description': '原型测试用数据目录。', 'data_url': 'data:text/csv;charset=utf-8,source_id,ra,dec%0Ademo-01,120.1,18.2%0A'}]},
    },
    {'title': '银河系低频巡天产品', 'author': 'proposer', 'type': 'DSL 研究提案', 'state': '待分配观测数据', 'instruments': ('LF',)},
    {'title': '超长波天空模型', 'author': 'proposer', 'type': 'DSL 研究提案', 'state': '待修改', 'instruments': ('HF',)},
    {'title': '暗弱源统计研究', 'author': 'proposer', 'type': 'DSL 研究提案', 'state': '已驳回', 'instruments': ('LF',)},
    # 机遇观测：覆盖快速评审、编排执行及反馈的每个界面阶段。
    {'title': '太阳活动区突发监测', 'author': 'proposer', 'type': 'DSL 机遇观测提案', 'state': '草稿', 'instruments': ('HF',), 'draft': True},
    {'title': '脉冲星异常爆发跟踪', 'author': 'proposer', 'type': 'DSL 机遇观测提案', 'state': '待形式审查', 'instruments': ('HF',)},
    {'title': '行星磁层扰动观测', 'author': 'proposer', 'type': 'DSL 机遇观测提案', 'state': '待技术评审', 'instruments': ('HF',)},
    {'title': '太阳射电爆发预警', 'author': 'proposer', 'type': 'DSL 机遇观测提案', 'state': '待科学评审', 'instruments': ('HF',)},
    {'title': '短时射电暂现源', 'author': 'proposer', 'type': 'DSL 机遇观测提案', 'state': '待最终决策', 'instruments': ('LF', 'HF')},
    {
        'title': '日冕物质抛射追踪',
        'author': 'proposer', 'type': 'DSL 机遇观测提案', 'state': '已推送观测编排', 'instruments': ('HF',),
        'feedback': {'status': 'scheduled', 'observation_id': 'TOO-DEMO-EXEC-01', 'visibility_window': '2026-11-20 02:00 至 05:00 UTC', 'summary': '已登记候选观测窗口，尚未提交执行结果。'},
    },
    {'title': '月球遮蔽窗口观测', 'author': 'proposer', 'type': 'DSL 机遇观测提案', 'state': '已推送观测编排', 'instruments': ('LF',)},
    {
        'title': '木星射电风暴后评估',
        'author': 'proposer', 'type': 'DSL 机遇观测提案', 'state': '执行反馈', 'instruments': ('HF',),
        'abstract': (
            '先导监测在木星可见窗口记录到低频射电活动增强，但原有扫描仅覆盖活动高峰，'
            '缺少对衰减阶段的连续测量。本申请拟在 72 小时内使用 DSL 高频频谱仪开展补充观测，'
            '比较木星方向与邻近空白天区的动态频谱和偏振特征，判断增强是否持续、是否出现重复爆发，'
            '并排除局地射频干扰。观测以 30–80 MHz 频段、1 秒时间分辨率记录目标窗口，'
            '同步保留质量控制和仪器状态信息。预期形成活动强度变化、重复检出情况及后续是否需要'
            '紧急观测的判断，为木星低频射电活动监测提供一份可复核的时序样例。'
        ),
        'application': {
            'event_type': 'planetary',
            'urgency': '72h',
            'trigger_and_value': (
                '先导频谱显示木星方向的宽带射电活动高于相邻时段背景，但单次扫描无法判断'
                '高峰后的持续时间和重复发生率。及时补充观测可检验活动是否已经回落，'
                '并通过空白天区对照识别共同出现的干扰。若未再次检出，也应给出本次窗口的'
                '有效观测时长和探测阈值，避免把无检出误写成目标不存在。'
            ),
            'targets': [{
                'target_name': '木星及邻近空白对照天区',
                'coordinates': '木星视位置由观测时刻星历确定；对照天区采用邻近无强源指向',
                'observation_window': '2026-10-18 12:00 至 2026-10-19 06:00 UTC',
                'visibility_note': '最终起止时间由编排时按轨道可见性与太阳避角复核。',
            }],
        },
        'instrument_data': {'HF': {
            'frequency_band': '30–80 MHz',
            'time_resolution': '1 秒',
            'spectral_resolution': '10 kHz',
            'polarization': 'full',
        }},
        'feedback': {
            'status': 'completed',
            'observation_id': 'TOO-DEMO-2026-0018',
            'visibility_window': '2026-10-19 01:10 至 02:55 UTC',
            'completed_at': '2026-10-19 04:20 UTC',
            'summary': (
                '模拟执行结果（仅用于原型演示）：HF 频谱仪完成木星方向与空白天区交替观测。'
                '质量控制后获得约 95 分钟有效数据，未发现达到预设 5σ 阈值的重复宽带爆发；'
                '弱窄带干扰已标记并剔除。本次窗口内活动回落，建议转入常规监测，不再追加紧急观测。'
            ),
        },
    },
    {
        'title': '射电暂现源补充申请',
        'author': 'proposer',
        'type': 'DSL 机遇观测提案',
        'state': '待修改',
        'instruments': ('HF',),
        'abstract': (
            '2026 年 10 月 16 日，先导监测在候选天区的两次独立扫描中发现持续数十秒的低频宽带增强。'
            '两次事件的出现位置和频段具有一定一致性，但现有数据的时间覆盖、信噪比及邻近空白天区对照不足，'
            '尚不能排除地面射频干扰或仪器效应。候选源可能在短时间内衰减，因此补充观测的时效性直接影响其物理来源判别。'
            '\n\n本申请拟在 72 小时内使用 DSL 高频频谱仪开展目标源与空白对照天区交替观测，'
            '获取 30–80 MHz 全极化动态频谱。通过比较两天区的同时性、频率漂移、偏振比例和重复发生率，'
            '判断信号是否具备天体来源的特征，并评估其与已知太阳、行星及暂现源辐射现象的关联。'
            '观测将优先覆盖候选源可见窗口，同时记录射频干扰环境和仪器工作状态，避免把局地异常误判为科学事件。'
            '\n\n预期交付经质量控制的动态频谱、候选事件时频图、干扰剔除记录及一份可复核的判别报告。'
            '若确认重复事件，将给出后续跟踪的建议窗口和所需灵敏度；若未再次检出，也将结合探测限给出通量上限，'
            '说明这次补充观测对候选信号约束的有效范围。上述结果将用于决定是否投入更长时间的持续监测，'
            '并为鸿蒙计划机遇观测的响应与数据处理流程提供一份可检验的案例。'
        ),
        'application': {
            'event_type': 'transient',
            'urgency': '72h',
            'trigger_and_value': (
                '本次申请基于先导监测中发现的两次独立候选事件。第一次事件出现在目标天区扫描的后半段，'
                '第二次出现在约两个小时后的重复扫描中；两者均表现为持续数十秒的低频宽带增强。'
                '现有资料只覆盖短时间片段，且未同步观测邻近空白天区，因此无法判断它们是否来自同一目标，'
                '也无法充分排除射频干扰、指向误差或接收链路波动。申请补充观测并不是为了单纯增加曝光，'
                '而是为了取得能够区分这些解释的对照数据。'
                '\n\n科学目标有三项：一是测量候选增强的持续时间、频率漂移和重复发生率，检验是否存在一致的时频结构；'
                '二是比较目标天区和空白对照天区的偏振及宽带特征，排查共同出现的局地干扰；'
                '三是在未检出的情况下给出明确的灵敏度和通量上限，使阴性结果仍可用于限制候选源的活动水平。'
                '如果信号具有天体来源特征，其时间和频率演化可为后续辐射机制研究提供线索；'
                '如果被判定为干扰，则可避免继续占用长期监测资源。'
                '\n\n候选源在先导监测后可能快速衰减。计划在 72 小时内完成首次补充观测，'
                '并在目标可见窗口内安排第二次重复观测，以尽量区分一次性事件和可重复活动。'
                '最终判断将同时依赖原始数据、质量控制记录和对照天区结果，而非仅凭单次峰值作出结论。'
            ),
            'targets': [
                {
                    'target_name': '候选暂现源 HM-TR-20261016',
                    'coordinates': '赤经 12h 30m 24s，赤纬 +18° 20′ 00″（J2000）',
                    'observation_window': '2026-10-18 12:00 至 2026-10-20 00:00 UTC',
                    'visibility_note': '初步轨道预报可提供约 3 小时有效窗口；实际起止时间由编排时复核。',
                },
                {
                    'target_name': '邻近空白对照天区',
                    'coordinates': '赤经 12h 42m 00s，赤纬 +18° 20′ 00″（J2000）',
                    'observation_window': '与候选源观测交替安排',
                    'visibility_note': '与目标天区接近，用于识别共同出现的背景和射频干扰。',
                },
            ],
        },
    },
    {
        'title': '低优先级射电触发',
        'author': 'proposer', 'type': 'DSL 机遇观测提案', 'state': '已驳回', 'instruments': ('HF',),
        'abstract': (
            '2026 年 10 月 16 日的低频巡测在候选天区记录到一次持续约 40 秒的 30–55 MHz 宽带增强，'
            '峰值信噪比约为 3.1。该增强只在一轮扫描中出现，尚无独立重复检出；相邻空白天区同一时段也存在'
            '较弱的射频干扰迹象，因此目前无法确认它是天体暂现信号。申请人希望在 72 小时内使用 DSL 高频频谱仪'
            '进行目标天区和空白对照天区的交替观测，比较时频结构和重复发生率。'
            '\n\n拟申请约 4 小时窗口，以 30–55 MHz 总强度动态频谱为主要数据，形成候选事件清单、干扰标记和'
            '检出上限。若再次出现一致的信号，将据此提出更完整的跟踪方案；若未检出，也可约束短时活动水平。'
            '但本次触发的原始数据尚未完成独立复核，正式可见窗口也未确认，申请人将这些不确定性列为本提案的'
            '主要风险。本条为流程演示数据，不代表真实天文事件。'
        ),
        'application': {
            'event_type': 'transient',
            'urgency': '72h',
            'trigger_and_value': (
                '触发依据是 10 月 16 日自动巡测中的一次边缘显著性宽带增强。初步检查显示，增强集中于 30–55 MHz，'
                '持续约 40 秒，峰值信噪比约 3.1；但同夜尚未取得第二次独立检出，邻近空白天区记录中也有'
                '弱干扰结构。现有证据不足以判定信号来自目标天区，尤其需要排除地面射频干扰和接收链路波动。'
                '\n\n申请人拟交替观测候选天区与空白对照天区，每轮各约 20 分钟，重复六轮，总计申请约 4 小时。'
                '主要分析指标是增强出现的时间、频率范围、漂移率及目标/对照天区的同时性。若在目标天区'
                '重复检出且对照天区无对应结构，将形成后续跟踪的依据；若两者同步出现或没有新检出，'
                '则提交干扰判别记录与通量上限。'
                '\n\n本申请希望利用候选事件可能衰减前的短时窗口，但尚缺独立复核后的动态频谱、完整干扰剔除'
                '报告和正式可见性窗口。上述材料的缺失会降低机遇观测的时效必要性和观测资源优先级。'
            ),
            'targets': [
                {
                    'target_name': '候选低频增强 HM-TR-20261016-B',
                    'coordinates': '赤经 12h 30m，赤纬 +18° 20′（J2000，演示坐标）',
                    'observation_window': '2026-10-18 02:00 至 2026-10-19 06:00 UTC',
                    'visibility_note': '尚未取得正式可见性计算结果；申请人估计可安排约 4 小时窗口。',
                },
                {
                    'target_name': '邻近空白对照天区',
                    'coordinates': '赤经 12h 42m，赤纬 +18° 20′（J2000，演示坐标）',
                    'observation_window': '与候选天区交替观测',
                    'visibility_note': '用于识别同频段、同时段的局地干扰。',
                },
            ],
        },
        'instrument_data': {
            'HF': {
                'frequency_band': '30–55 MHz',
                'time_resolution': '2 秒',
                'spectral_resolution': '50 kHz',
                'polarization': 'total',
            },
        },
        'prior_reviews': (
            {
                'type': 'technical',
                'reviewer': 'tech_expert',
                'scores': {'technical_feasibility': 3, 'instrument_match': 4},
                'recommendation': 'pass',
                'comments': (
                    '所申请的 HF 频段、时间分辨率与总强度模式可执行，目标与空白天区交替观测也具备技术可行性。'
                    '但申请材料缺少正式可见性计算结果及射频干扰基线；建议在资源分配前补齐这些核验材料。'
                    '本意见仅评估技术可行性，不判断事件的科学优先级。'
                ),
                'submitted_at': '2026-10-18T06:15:00',
            },
            {
                'type': 'scientific',
                'reviewer': 'reviewer',
                'scores': {'scientific_merit': 2, 'urgency': 2},
                'recommendation': 'reject',
                'comments': (
                    '候选增强只有一次边缘显著性记录，尚无独立重复检出，且空白对照天区可见同频干扰迹象。'
                    '目前无法建立可靠的天体来源或 72 小时内必须响应的科学依据。'
                    '建议先完成原始动态频谱复核、干扰排查和可见窗口计算，再评估新的机遇观测申请。'
                ),
                'submitted_at': '2026-10-18T07:10:00',
            },
        ),
        'decision': {
            'priority': 2,
            'reason': (
                '委员会决定驳回本次机遇观测申请。触发信号仅有一次边缘显著性检出，缺少独立重复观测；'
                '空白对照天区存在同频干扰迹象，现阶段不能可靠区分天体信号与局地射频干扰。'
                '申请材料也未提供完成复核的动态频谱、干扰剔除记录和正式可见窗口，尚不足以证明'
                '必须占用 72 小时内的机遇观测资源。综合优先级为 2/5。'
                '\n\n本次申请流程至此结束，不进入观测编排。申请人可在取得独立重复检出、'
                '完成数据质量检查和可见性复核后，另行提出新的申请。'
            ),
        },
    },
    {
        'title': '后发座星系团射电晕观测',
        'legacy_title': '射电星系群谱研究',
        'author': 'proposer',
        'type': 'DSL 研究提案',
        'state': '待最终决策',
        'instruments': ('LF', 'HF'),
        'abstract': (
            '后发座星系团（Coma / Abell 1656）拥有已知的大尺度弥散射电晕，是研究星系团内非热粒子与磁场的基准目标。'
            '既有 144 MHz 成像揭示射电晕及其外缘结构，54–144 MHz 的星系团样本研究也提示部分射电晕具有很陡的低频谱。'
            '然而，这些结果不能直接推断 10–25 MHz 的亮度：更低频段的天空背景、前景混叠、紧致源污染和仪器响应'
            '均可能掩盖弥散信号。本申请拟利用 DSL 低频成像阵列对 Coma 中心及邻近对照天区开展分段深积分，'
            '并用高频频谱仪记录宽带干扰环境。研究目标是检验超长波频段能否恢复射电晕的积分辐射，'
            '比较中心与外缘的频谱变化；若未达到可靠检出阈值，则给出可复现的通量密度上限，而不将噪声结构解释为射电晕。'
            '\n\n计划申请累计 48 小时低频阵列积分，优先分析 10–25 MHz 子频段，并保留更低频数据用于质量评估。'
            '分析将使用邻近空白天区、紧致源模型和注入—回收测试量化背景与成像偏差，'
            '再与已发表的较高频结果做同一孔径的谨慎比较。预期交付校准数据、分频段图像、'
            '质量控制记录、检出显著性或上限，以及明确列出系统误差的科学报告。'
            '本条为原型演示申请；具体可见窗口、灵敏度和最终观测参数仍须由正式计算与技术评审确认。'
        ),
        'application': {
            'science_category': 'extragalactic',
            'science_objective': (
                '本研究以 Coma 射电晕为单一重点目标，回答两个可检验问题：第一，DSL 在 10–25 MHz 是否能从强银河前景'
                '和紧致源混叠中恢复可信的星系团尺度弥散辐射；第二，若能够检出，中心与外缘的低频谱是否显示'
                '不同的变化趋势。较高频文献已报道 Coma 射电晕及外缘结构，但本提案不把文献中的谱指数'
                '直接外推为超长波检出保证。\n\n'
                '主要结果采用预先固定的晕区和外缘孔径、共同角分辨率以及盲注入—回收测试评估。'
                '若弥散结构在独立时段和相邻子频段均达到预设显著性，报告积分通量及统计、标定和前景误差；'
                '若条件不满足，则按同一孔径给出上限。成果将包括可追溯的成像产品、紧致源扣除残差、'
                '不同频段的通量或上限表，以及对超长波观测星系团射电晕适用范围的评估。'
            ),
            'targets': [
                {
                    'target_name': '后发座星系团（Coma / Abell 1656）射电晕',
                    'coordinates': '约赤经 12h 59m，赤纬 +28°（J2000；排程前复核指向中心）',
                    'observation_window': '拟申请 2027-02-01 至 2027-05-31 内累计 48 小时',
                    'visibility_note': '申请时段并非已核准窗口；正式可见性、月球遮蔽和太阳角距待计算。',
                },
                {
                    'target_name': 'Coma 邻近空白对照天区（最终指向待筛选）',
                    'coordinates': 'Coma 周边相近赤纬天区；排除已知强射电源后确定中心',
                    'observation_window': '与目标观测交替安排，至少覆盖相同的仪器状态',
                    'visibility_note': '用于检验共同前景、仪器条纹和伪弥散结构，不作为科学检出目标。',
                },
            ],
            'technical_summary': (
                '以 DSL 低频成像阵列为主仪器，申请 48 小时累计积分，按多个独立轨道时段实施，'
                '避免单一时段异常主导结果。优先处理 10–25 MHz；在正式灵敏度预算完成前，'
                '不承诺射电晕可检出。每个时段记录阵列状态、有效基线、频段占用和强源环境，'
                '剔除异常数据后制作分频段图像，并用相同成像权重生成目标与对照产品。\n\n'
                '先以高分辨率参考源表建立紧致源模型，检查扣除残差，再对扩展源进行多尺度成像和背景拟合。'
                '通过在原始可见度中注入不同亮度、不同尺度的模拟射电晕，测量回收率和伪检出率；'
                '主结果要求在至少两个独立时段及相邻频段中保持空间一致。HF 频谱仪仅承担同时段射频环境和'
                '频谱异常监测，不将其总功率数据当作射电晕形态图。最终频带、角分辨率和观测窗口'
                '以技术评审及可见性计算为准。'
            ),
            'data_plan': (
                '原始数据先进行完整性、时间同步和频段占用检查，保存所有标定与剔除标志。'
                '交付按时段和频段组织的校准数据、目标/对照图像、紧致源模型与残差图、'
                '注入—回收曲线、积分通量或上限表及处理脚本版本。科学报告将分别列出统计误差、'
                '标定误差和前景/混叠系统误差，并说明与公开 54 MHz、144 MHz 文献结果比较时的'
                '孔径和分辨率差异；未检出同样作为正式结果记录。'
            ),
        },
        'instrument_data': {
            'LF': {
                'frequency_band': '优先 10–25 MHz；其余频段用于质量评估',
                'integration_hours': 48,
                'angular_resolution': '目标约 10 角分，最终以阵列配置为准',
                'imaging_mode': 'deep',
            },
            'HF': {
                'frequency_band': '30–80 MHz（干扰环境监测）',
                'time_resolution': '1 秒',
                'spectral_resolution': '10 kHz',
                'polarization': 'full',
            },
        },
        'prior_reviews': (
            {
                'type': 'technical',
                'reviewer': 'tech_expert',
                'scores': {'technical_feasibility': 3, 'instrument_match': 4},
                'recommendation': 'pass',
                'comments': (
                    'LF 阵列与扩展源成像目标匹配，HF 用于干扰监测的定位也清楚。'
                    '但 48 小时有效积分、10–25 MHz 灵敏度及 Coma 正式可见窗口尚未核实；'
                    '建议委员会在批准资源前要求补充灵敏度预算和注入—回收验收阈值。'
                ),
                'submitted_at': '2026-10-17T05:30:00',
            },
            {
                'type': 'scientific',
                'reviewer': 'reviewer',
                'scores': {'scientific_merit': 4, 'priority': 3},
                'recommendation': 'pass',
                'comments': (
                    'Coma 是合适的基准目标，申请把可靠检出和有约束力的未检出上限都作为成果，'
                    '科学问题与质量控制路径较明确。建议优先确保对照天区、紧致源扣除和系统误差评估；'
                    '在正式可见性与灵敏度预算确认后，再由委员会决定是否占用所申请的深积分时长。'
                ),
                'submitted_at': '2026-10-17T08:20:00',
            },
        ),
    },
)


def demo_pdf_data():
    """A small valid PDF used as an applicant-uploaded demo file."""
    stream = b'BT /F1 16 Tf 72 760 Td (DSL RPS applicant material) Tj ET'
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream',
    ]
    output = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f'{index} 0 obj\n'.encode())
        output.extend(obj)
        output.extend(b'\nendobj\n')
    xref = len(output)
    output.extend(f'xref\n0 {len(objects) + 1}\n'.encode())
    output.extend(b'0000000000 65535 f \n')
    output.extend(b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets[1:]))
    output.extend(f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode())
    return 'data:application/pdf;base64,' + b64encode(bytes(output)).decode()


def seed(only_title=None):
    app = create_app()
    with app.app_context():
        demo_ids = {title: proposal_id for proposal_id, (title, _) in DEMO_CATALOG.items()}
        manager_role = Role.query.filter_by(name='Proposal Manager').first()
        if manager_role is None:
            manager_role = Role(name='Proposal Manager', is_system=True)
            db.session.add(manager_role)
        manager = User.query.filter_by(username='proposal_manager').first()
        if manager is None:
            manager = User(
                username='proposal_manager',
                email='proposal_manager@example.com',
                is_active=True,
            )
            manager.set_password('password')
            db.session.add(manager)
        if manager_role not in manager.roles:
            manager.roles.append(manager_role)

        if only_title is None:
            for legacy_proposal in Proposal.query.filter(
                Proposal.title.like('【研究·%】%') | Proposal.title.like('【机遇·%】%')
            ).all():
                new_title = legacy_proposal.title.split('】', 1)[-1]
                if Proposal.query.filter_by(title=new_title).first() is None:
                    legacy_proposal.title = new_title

        for sample in SAMPLES:
            if only_title is not None and sample['title'] != only_title:
                continue
            if sample.get('application', {}).get('science_category') == 'extragalactic':
                template = FormTemplate.query.filter_by(name='DSL 研究提案申请表').first()
                if template is not None:
                    definition = template.definition or {}
                    fields = list(definition.get('fields') or [])
                    for index, field in enumerate(fields):
                        if field.get('name') != 'science_category':
                            continue
                        options = list(field.get('options') or [])
                        if not any(option.get('value') == 'extragalactic' for option in options):
                            options.append({'value': 'extragalactic', 'label': '星系团与河外源'})
                            fields[index] = {**field, 'options': options}
                            template.definition = {**definition, 'fields': fields}
                        break
            author = User.query.filter_by(username=sample['author']).one()
            proposal_type = ProposalType.query.filter_by(name=sample['type']).one()
            current_state = WorkflowState.query.filter_by(
                workflow_id=proposal_type.workflow_id,
                name=sample['state'],
            ).one()
            proposal = Proposal.query.filter_by(title=sample['title']).first()
            if proposal is None and sample.get('legacy_title'):
                proposal = Proposal.query.filter_by(title=sample['legacy_title']).first()
            expected_id = demo_ids[sample['title']]
            occupied = db.session.get(Proposal, expected_id)
            if proposal is not None and proposal.id != expected_id:
                raise RuntimeError(f"{sample['title']} 应为 RPS-{expected_id:05d}，实际为 RPS-{proposal.id:05d}")
            if proposal is None and occupied is not None:
                raise RuntimeError(f'RPS-{expected_id:05d} 已被 {occupied.title} 占用，停止生成重复提案')
            if proposal is not None and only_title is None:
                # A full seed run must not reset a proposal's live workflow state
                # or overwrite edits made after the demo fixture was created.
                continue
            if proposal is None:
                proposal = Proposal(id=expected_id, title=sample['title'], author=author, proposal_type=proposal_type)
                db.session.add(proposal)
            else:
                proposal.title = sample['title']
            is_opportunity = '机遇' in sample['type']
            proposal.abstract = sample.get('abstract') or (
                '面向鸿蒙计划超长波观测能力的机遇观测演示提案，用于验证快速评审、观测编排与执行反馈。'
                if is_opportunity else
                '面向鸿蒙计划超长波数据研究的演示提案，用于验证申请、评审、数据处理与分配流程。'
            )
            proposal.author = author
            proposal.proposal_type = proposal_type
            proposal.current_state = current_state

            phase = proposal.phases.filter_by(phase='phase1').first()
            if phase is None:
                phase = ProposalPhase(proposal=proposal, phase='phase1', opened_at=datetime.utcnow())
                db.session.add(phase)
            phase.status = 'draft' if sample.get('draft') else 'submitted'
            phase.submitted_at = None if sample.get('draft') else (phase.submitted_at or datetime.utcnow())
            document_name = f"{sample['title']}-申请人上传材料.pdf"
            document_data = demo_pdf_data()
            phase.payload = {
                **(
                    {
                        'event_type': 'solar' if '太阳' in sample['title'] else 'planetary',
                        'urgency': '72h',
                        'trigger_and_value': '目标具有明显时效性，需要在有效观测窗口内快速响应。',
                    }
                    if is_opportunity else
                    {
                        'science_category': 'dark_ages' if '黑暗' in sample['title'] else 'all_sky',
                        'science_objective': '研究低频射电天空及宇宙早期信号，形成可复用的科学数据产品。',
                        'technical_summary': '结合绕月编队轨道与遮蔽窗口安排多频段积分观测。',
                        'data_plan': '完成标定、成像或频谱提取后形成阶段性数据产品。',
                    }
                ),
                'targets': [{
                    'target_name': '主要观测目标',
                    'coordinates': '赤经 12h 30m，赤纬 +18° 20′',
                    'observation_window': '2026-11-12 至 2026-11-18',
                    'visibility_note': '已完成初步可见性计算，可用窗口约 18.6 小时。',
                }],
                **sample.get('application', {}),
                '__attachments__': {
                    'proposal_document': {
                        'name': document_name,
                        'size': len(document_data),
                        'type': 'application/pdf',
                        'data_url': document_data,
                    }
                },
            }

            for code in sample['instruments']:
                instrument = Instrument.query.filter_by(code=code).one()
                entry = proposal.instruments.filter_by(instrument_id=instrument.id, phase='phase1').first()
                if entry is None:
                    entry = ProposalInstrument(proposal=proposal, instrument=instrument, phase='phase1')
                    db.session.add(entry)
                feedback = sample.get('feedback', {})
                entry.status = feedback.get('status', 'submitted')
                entry.form_data = sample.get('instrument_data', {}).get(code) or (
                    {
                        'frequency_band': '0.5–25 MHz',
                        'integration_hours': 48,
                        'angular_resolution': '约 10 角分',
                        'imaging_mode': 'deep',
                    }
                    if code == 'LF' else
                    {
                        'frequency_band': '1–120 MHz',
                        'time_resolution': '1 秒',
                        'spectral_resolution': '10 kHz',
                        'polarization': 'full',
                    }
                )
                entry.scheduling_feedback = feedback
                if feedback.get('status') == 'completed':
                    completed_at = datetime.fromisoformat(feedback['completed_at'].replace(' UTC', ''))
                    entry.feedback_submitted_at = completed_at
                    db.session.flush()
                    result = InstrumentFeedback.query.filter_by(
                        proposal_instrument_id=entry.id,
                        status='completed',
                    ).first()
                    if result is None:
                        result = InstrumentFeedback(proposal_instrument=entry)
                        db.session.add(result)
                    result.scheduler = User.query.filter_by(username='tech_expert').one()
                    result.payload = feedback
                    result.status = 'completed'
                    result.comment = '模拟观测执行结果，仅用于原型演示。'
                    result.submitted_at = completed_at

            review_type = None
            reviewer_name = None
            if sample['state'] == '待技术评审':
                review_type, reviewer_name = 'technical', 'tech_expert'
            elif sample['state'] == '待科学评审':
                review_type, reviewer_name = 'scientific', 'reviewer'
            elif sample['state'] == '待最终决策':
                review_type, reviewer_name = 'committee', 'chair'
            if review_type:
                db.session.flush()
                reviewer = User.query.filter_by(username=reviewer_name).one()
                assignment = ProposalReview.query.filter_by(
                    proposal_id=proposal.id,
                    reviewer_id=reviewer.id,
                    review_type=review_type,
                ).first()
                if assignment is None:
                    db.session.add(ProposalReview(
                        proposal=proposal,
                        reviewer=reviewer,
                        review_type=review_type,
                        status='assigned',
                    ))
            if sample.get('completed_reviews'):
                for completed_type, reviewer_name, completed_comment in (
                    ('technical', 'tech_expert', '技术条件满足观测要求，建议进入科学评审。'),
                    ('scientific', 'reviewer', '科学目标明确，建议安排观测。'),
                    ('committee', 'chair', '委员会同意通过，数据处理完成后由管理员分配给提案者。'),
                ):
                    db.session.flush()
                    reviewer = User.query.filter_by(username=reviewer_name).one()
                    assignment = ProposalReview.query.filter_by(
                        proposal_id=proposal.id,
                        reviewer_id=reviewer.id,
                        review_type=completed_type,
                    ).first()
                    if assignment is None:
                        assignment = ProposalReview(
                            proposal=proposal,
                            reviewer=reviewer,
                            review_type=completed_type,
                        )
                        db.session.add(assignment)
                    assignment.status = 'submitted'
                    assignment.scores = {'overall': 5}
                    assignment.recommendation = 'pass'
                    assignment.comments = completed_comment
                    assignment.submitted_at = assignment.submitted_at or datetime.utcnow()
            elif sample['state'] in {
                '已通过', '待分配观测数据', '数据已授权',
                '已推送观测编排', '执行反馈', '已完成', '已驳回',
            }:
                db.session.flush()
                reviewer = User.query.filter_by(username='chair').one()
                decision = ProposalReview.query.filter_by(
                    proposal_id=proposal.id,
                    reviewer_id=reviewer.id,
                    review_type='committee',
                ).first()
                if decision is None:
                    rejected = sample['state'] == '已驳回'
                    decision = ProposalReview(
                        proposal=proposal,
                        reviewer=reviewer,
                        review_type='committee',
                        status='submitted',
                        scores={'overall_priority': 3},
                        recommendation='reject' if rejected else 'pass',
                        comments=('演示决策：驳回申请。' if rejected else
                                  '演示决策：批准进入观测编排。' if is_opportunity else
                                  '演示决策：批准，等待数据产品分配。'),
                        submitted_at=datetime.utcnow(),
                    )
                    db.session.add(decision)
                if sample.get('decision'):
                    decision.status = 'submitted'
                    decision.scores = {'overall_priority': sample['decision']['priority']}
                    decision.recommendation = 'reject'
                    decision.comments = sample['decision']['reason']
                    decision.submitted_at = decision.submitted_at or datetime.utcnow()
            for prior_review in sample.get('prior_reviews', ()):
                db.session.flush()
                reviewer = User.query.filter_by(username=prior_review['reviewer']).one()
                assignment = ProposalReview.query.filter_by(
                    proposal_id=proposal.id,
                    reviewer_id=reviewer.id,
                    review_type=prior_review['type'],
                ).first()
                if assignment is None:
                    assignment = ProposalReview(
                        proposal=proposal,
                        reviewer=reviewer,
                        review_type=prior_review['type'],
                    )
                    db.session.add(assignment)
                assignment.status = 'submitted'
                assignment.scores = prior_review['scores']
                assignment.recommendation = prior_review['recommendation']
                assignment.comments = prior_review['comments']
                assignment.submitted_at = datetime.fromisoformat(prior_review['submitted_at'])
            # The historical demo snapshots start in different workflow stages.
            # Supply visibly labelled demo evidence for preceding review stages,
            # without replacing any real review that already exists.
            prior_stages = (
                ('technical', 'tech_expert'),
                ('scientific', 'reviewer'),
            )
            for index, (completed_type, reviewer_name) in enumerate(prior_stages, start=1):
                required = (
                    completed_type == 'technical' and sample['state'] in {
                        '待科学评审', '待最终决策', '待分配观测数据',
                        '数据已授权', '已推送观测编排', '执行反馈', '已完成', '已驳回',
                    }
                ) or (
                    completed_type == 'scientific' and sample['state'] in {
                        '待最终决策', '待分配观测数据', '数据已授权',
                        '已推送观测编排', '执行反馈', '已完成', '已驳回',
                    }
                )
                if not required:
                    continue
                reviewer = User.query.filter_by(username=reviewer_name).one()
                existing = ProposalReview.query.filter_by(
                    proposal_id=proposal.id,
                    reviewer_id=reviewer.id,
                    review_type=completed_type,
                ).first()
                if existing is not None:
                    continue
                is_scientific_reject = sample['state'] == '已驳回' and completed_type == 'scientific'
                db.session.add(ProposalReview(
                    proposal=proposal,
                    reviewer=reviewer,
                    review_type=completed_type,
                    status='submitted',
                    scores=(
                        {'scientific_merit': 2, 'priority': 2} if is_scientific_reject
                        else {'technical_feasibility': 4, 'instrument_match': 4}
                        if completed_type == 'technical'
                        else {'scientific_merit': 4, 'priority': 3}
                    ),
                    recommendation='reject' if is_scientific_reject else 'pass',
                    comments=(
                        '演示补录：科学优先级不足，建议不予批准；此条并非专家真实提交记录。'
                        if is_scientific_reject else
                        '演示补录：仪器参数与申请目标基本匹配；此条并非专家真实提交记录。'
                        if completed_type == 'technical' else
                        '演示补录：科学目标具备评议价值；此条并非专家真实提交记录。'
                    ),
                    submitted_at=(phase.submitted_at or proposal.timestamp) + timedelta(hours=index),
                ))
        if only_title is None:
            db.session.flush()
            demo_proposals = Proposal.query.filter(Proposal.id.in_(DEMO_CATALOG)).all()
            issues = audit(demo_proposals, demo_catalog=True)
            if issues:
                db.session.rollback()
                raise RuntimeError('演示提案完整性核查失败：\n' + '\n'.join(issues))
        db.session.commit()
        print('DSL demo proposals seeded')


if __name__ == '__main__':
    seed()
