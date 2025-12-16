import React, { Component, useContext } from 'react';

interface ITheme {
  color: string;
  border: string;
  type: string;
}

interface ICheckBox {
  label: string;
  name: string;
  onChange: () => void;
}

interface IInput {
  label: string;
  placeholder: string;
}

const theme = {
  dark: { color: '#1890ff', border: '1px solid blue', type: 'dark'},
  light: { color: '#fc4838', border: '1px solid pink', type: 'light'},
}

const ThemeContext = React.createContext({theme: theme.dark, setTheme: (theme:ITheme) => {}});

// contextType模式
class CheckBox extends Component<ICheckBox> {
  constructor(props: ICheckBox) {
    super(props);
  }
  render () {
    const { label, name, onChange } = this.props;
    // @ts-ignore
    const { theme } = this.context;
    const { type, color } = theme;
    return (
      <>
        <label htmlFor='name' style={{color}}>{label}</label>
        <input type='checkbox' name={name} checked={name === type} onChange={onChange} />
      </>
    )
  }
}

CheckBox.contextType = ThemeContext;

// useContext模式
const Input = ({ placeholder, label }: IInput) => {
  const { theme } = useContext(ThemeContext);
  const { color } = theme;
  return (
    <div>
      <label style={{color}}>{label}</label>
      <input placeholder={placeholder} />
    </div>
  )
}

// 订阅者模式
const App = () => {
  return (
    <ThemeContext.Consumer>
      {({theme:curTheme, setTheme}) => (
          <div style={{border: curTheme.border}}>
            <span style={{ color: curTheme.color }}>选择主题：</span>
            <CheckBox label="light" name="light" onChange={() => setTheme(theme.light)} />
            <CheckBox label="dark" name="dark" onChange={() => setTheme(theme.dark)} />
            <Input label='姓名' placeholder='狸狸' />
          </div>
      )}
    </ThemeContext.Consumer>
  )
}

class Context extends Component {
  constructor (props: any) {
    super(props);
    this.state = {
      theme: theme.light,
    }
  }
  render() {
    // @ts-ignore
    const { theme } = this.state;
    return (
      <ThemeContext.Provider value={{ theme, setTheme: (theme: ITheme) => this.setState({theme})}}>
        <App />
      </ThemeContext.Provider>
    )
  }
}

export default Context;

