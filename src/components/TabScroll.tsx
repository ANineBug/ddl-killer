import { ScrollViewProps } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

// 标签页里的上下滚动。用手势库自带的滚动视图，页面里的横向手势
// （作业卡片划走、课表翻周）才能和上下滚动在原生层互相让路
export function TabScrollView(props: ScrollViewProps) {
  return <ScrollView {...props} />;
}
