import React from 'react';
import styles from './styles.scss';

export type TextType = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';

interface ITextProps {
  type: TextType;
  bold?: boolean;
  children: React.ReactNode;
  className?: string;
  size?: number;
}
export const Text = ({ type, bold = false, children, className, size }: ITextProps): JSX.Element => {
  const generalStyles: { [key in string]: string | number } = {
    ['fontWeight']: bold ? 'bold' : 'normal',
    ...(size ? { fontSize: size } : {})
  };

  switch (type) {
    case 'h1':
      return (
        <h1 className={`${styles.H1} ${className ? className : ''}`} style={generalStyles}>
          {children}
        </h1>
      );
    case 'h2':
      return (
        <h2 className={`${styles.H2} ${className ? className : ''}`} style={generalStyles}>
          {children}
        </h2>
      );
    case 'h3':
      return (
        <h3 className={`${styles.H3} ${className ? className : ''}`} style={generalStyles}>
          {children}
        </h3>
      );
    case 'h4':
      return (
        <h4 className={`${styles.H4} ${className ? className : ''}`} style={generalStyles}>
          {children}
        </h4>
      );
    case 'h5':
      return (
        <h5 className={`${styles.H5} ${className ? className : ''}`} style={generalStyles}>
          {children}
        </h5>
      );
    case 'h6':
      return (
        <h6 className={`${styles.H6} ${className ? className : ''}`} style={generalStyles}>
          {children}
        </h6>
      );
    case 'p':
      return (
        <p className={`${styles.ParagraphStyles} ${className ? className : ''}`} style={generalStyles}>
          {children}
        </p>
      );
    case 'span':
      return (
        <span className={`${styles.SpanStyles} ${className ? className : ''}`} style={generalStyles}>
          {children}
        </span>
      );
    default:
      return (
        <p className={`${styles.ParagraphStyles} ${className ? className : ''}`} style={generalStyles}>
          {children}
        </p>
      );
  }
};
