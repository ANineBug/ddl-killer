import { createContext, useContext } from 'react';
import { ScrollViewProps } from 'react-native';
import { type PanGesture, ScrollView } from 'react-native-gesture-handler';

// 底部三页左右翻页用的手势，由 (tabs)/_layout 提供
export const PagerGestureContext = createContext<PanGesture | undefined>(undefined);

// 标签页里的上下滚动：和左右翻页"同时识别"同一根手指。
// 安卓原生的滚动一旦开始会独占这次触摸，普通写法下翻页就收不到消息了；
// 这样声明以后，往下滑到一半不松手、再横着走，翻页也能接手
export function TabScrollView(props: ScrollViewProps) {
  const pager = useContext(PagerGestureContext);
  return <ScrollView {...props} simultaneousWith={pager} />;
}
