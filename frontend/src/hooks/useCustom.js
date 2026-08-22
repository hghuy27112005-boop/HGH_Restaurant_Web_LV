import { useState } from 'react';

export const useLoading = (initialState = false) => {
    const [loading, setLoading] = useState(initialState);

    const startLoading = () => setLoading(true);
    const stopLoading = () => setLoading(false);

    return { loading, startLoading, stopLoading, setLoading };
};

export const useAsync = (asyncFunction, immediate = true) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const { loading, startLoading, stopLoading } = useLoading(false);

    const execute = async () => {
        startLoading();
        try {
            const response = await asyncFunction();
            setData(response);
            setError(null);
        } catch (err) {
            setError(err);
            setData(null);
        } finally {
            stopLoading();
        }
    };

    return { execute, data, error, loading };
};

export const useForm = (initialValues, onSubmit) => {
    const [values, setValues] = useState(initialValues);
    const [touched, setTouched] = useState({});
    const [errors, setErrors] = useState({});
    const { loading, startLoading, stopLoading } = useLoading(false);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setValues({
            ...values,
            [name]: type === 'checkbox' ? checked : value,
        });
    };

    const handleBlur = (e) => {
        const { name } = e.target;
        setTouched({ ...touched, [name]: true });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        startLoading();
        try {
            await onSubmit(values);
        } catch (err) {
            setErrors(err);
        } finally {
            stopLoading();
        }
    };

    return {
        values,
        touched,
        errors,
        loading,
        setValues,
        setTouched,
        setErrors,
        handleChange,
        handleBlur,
        handleSubmit,
    };
};
