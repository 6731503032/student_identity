// testing

const supabase = require('./supabaseClient');

async function main() {
  // INSERT a student
  const { data: insertData, error: insertError } = await supabase
    .from('students')
    .insert([
      {
        student_id: '6731503032',
        first_name: 'Wacharaphong',
        last_name: 'Sutthiboriban',
        email: '6731503032@lamduan.mfu.ac.th',
        age: 20,
      },
    ])
    .select();

  if (insertError) {
    console.error('Insert error:', insertError.message);
  } else {
    console.log('Inserted student:', insertData);
  }

  // SELECT all students
  const { data: students, error: selectError } = await supabase
    .from('students')
    .select('*');

  if (selectError) {
    console.error('Select error:', selectError.message);
  } else {
    console.log('All students:', students);
  }
}

main();