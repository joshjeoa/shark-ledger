/**
 * Chart.js 按需注册：只引入项目实际用到的控制器/元素/组件（折线、柱状、环形），
 * 替代 chart.js/auto 的全量注册 —— 图表 chunk 从 ~204KB 显著缩小（约省一半）。
 * 新增图表类型（如饼图/雷达图）时，回到这里补对应 Controller/Element 即可。
 */
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

Chart.register(
  // 元素
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  // 控制器
  DoughnutController,
  LineController,
  BarController,
  // 比例尺
  CategoryScale,
  LinearScale,
  // 插件
  Filler,
  Legend,
  Tooltip,
);

export { Chart };
